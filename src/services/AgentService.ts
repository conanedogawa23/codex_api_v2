import mongoose from 'mongoose';

import { AppError } from '../middleware';
import { Project } from '../models/Project';
import { ChatSession, IChatMessage, IChatSession } from '../models/ChatSession';
import { logger } from '../utils/logger';
import { AuthenticatedUser } from '../utils/auth';

import { chatPubSub, getChatStreamTopic } from './chatPubSub';
import { mcpBridge } from './MCPBridge';
import { VLLMMessage, vllmProxy } from './VLLMProxy';

const MAX_TOOL_ITERATIONS = 10;
const PROJECT_ID_ARGUMENT_KEYS = new Set(['project_id', 'projectId', 'source_project_id', 'target_project_id']);

interface ProjectToolContext {
  databaseId: string;
  gitlabId: number;
  name: string;
  pathWithNamespace: string;
}

export class AgentService {
  public async executeSession(sessionId: string, currentUser: AuthenticatedUser): Promise<void> {
    const session = await ChatSession.findOne({
      _id: sessionId,
      userId: new mongoose.Types.ObjectId(currentUser.userId),
    });

    if (!session) {
      throw new AppError('Chat session not found', 404);
    }

    const projectContext = await this.resolveProjectContext(session.projectId?.toString());
    const tools = await mcpBridge.listToolsAsVLLMFunctions();
    const messages: VLLMMessage[] = [
      this.buildSystemMessage(currentUser, projectContext),
      ...this.toVLLMMessages(session.messages),
    ];

    let iterations = 0;

    try {
      while (iterations < MAX_TOOL_ITERATIONS) {
        iterations += 1;

        const response = await vllmProxy.chatCompletion({
          messages,
          tools,
          temperature: 0,
          maxTokens: 2000,
        });

        if (response.toolCalls.length === 0) {
          break;
        }

        const assistantToolMessage: IChatMessage = {
          role: 'assistant',
          content: response.content,
          toolCalls: response.toolCalls,
          timestamp: new Date(),
        };
        session.messages.push(assistantToolMessage);
        messages.push({
          role: 'assistant',
          content: response.content,
          tool_calls: response.toolCalls.map((toolCall) => ({
            id: toolCall.id,
            type: 'function',
            function: {
              name: toolCall.name,
              arguments: toolCall.arguments,
            },
          })),
        });

        for (const toolCall of response.toolCalls) {
          await this.publishChunk({
            sessionId: session.id,
            content: '',
            done: false,
            toolCallInProgress: toolCall.name,
          });

          const parsedArguments = this.parseToolArguments(toolCall.arguments);
          const normalizedArguments = this.normalizeToolArguments(
            toolCall.name,
            parsedArguments,
            projectContext
          );

          const toolResult = await mcpBridge.callTool(toolCall.name, normalizedArguments);
          const toolMessage: IChatMessage = {
            role: 'tool',
            content: toolResult,
            toolCallId: toolCall.id,
            name: toolCall.name,
            timestamp: new Date(),
          };

          session.messages.push(toolMessage);
          messages.push({
            role: 'tool',
            content: toolResult,
            tool_call_id: toolCall.id,
          });
        }

        await session.save();
      }

      const finalMessages: VLLMMessage[] = [
        ...messages,
        {
          role: 'user',
          content:
            'Provide the final response to the user using the gathered GitLab and project context. Do not call any more tools.',
        },
      ];

      let finalContent = '';
      for await (const chunk of vllmProxy.streamChatCompletion({
        messages: finalMessages,
        temperature: 0.1,
        maxTokens: 2000,
      })) {
        finalContent += chunk;
        await this.publishChunk({
          sessionId: session.id,
          content: chunk,
          done: false,
          toolCallInProgress: null,
        });
      }

      session.messages.push({
        role: 'assistant',
        content: finalContent,
        timestamp: new Date(),
      });
      await session.save();

      await this.publishChunk({
        sessionId: session.id,
        content: '',
        done: true,
        toolCallInProgress: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown agent error';
      logger.error('Chat agent execution failed', {
        error: message,
        sessionId,
        userId: currentUser.userId,
      });

      session.messages.push({
        role: 'assistant',
        content: `I ran into an error while processing your request: ${message}`,
        isError: true,
        timestamp: new Date(),
      });
      await session.save();

      await this.publishChunk({
        sessionId: session.id,
        content: `I ran into an error while processing your request: ${message}`,
        done: true,
        toolCallInProgress: null,
      });
    }
  }

  private buildSystemMessage(
    currentUser: AuthenticatedUser,
    projectContext: ProjectToolContext | null
  ): VLLMMessage {
    const prompt = [
      'You are Codex AI, an internal engineering assistant.',
      'Use the available GitLab MCP tools before making assumptions about repositories, issues, merge requests, pipelines, milestones, or wiki pages.',
      'If a repository-scoped tool expects a project identifier, prefer the GitLab numeric project id. If a path is accepted, prefer path_with_namespace.',
      'Keep answers concise, actionable, and grounded in tool output.',
      `Current user: ${currentUser.username} (${currentUser.role}, ${currentUser.department})`,
      projectContext
        ? `Current project: ${projectContext.name} (database id: ${projectContext.databaseId}, GitLab project id: ${projectContext.gitlabId}, path_with_namespace: ${projectContext.pathWithNamespace})`
        : 'No project selected.',
    ].join('\n');

    return {
      role: 'system',
      content: prompt,
    };
  }

  private toVLLMMessages(messages: IChatMessage[]): VLLMMessage[] {
    return messages.map((message) => ({
      role: message.role,
      content: message.content,
      tool_call_id: message.toolCallId,
      tool_calls: message.toolCalls?.map((toolCall) => ({
        id: toolCall.id,
        type: 'function',
        function: {
          name: toolCall.name,
          arguments: toolCall.arguments,
        },
      })),
    }));
  }

  private parseToolArguments(rawArguments: string): Record<string, unknown> {
    try {
      return rawArguments ? (JSON.parse(rawArguments) as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }

  private async resolveProjectContext(projectId?: string): Promise<ProjectToolContext | null> {
    if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
      return null;
    }

    const project = await Project.findById(projectId)
      .select('_id gitlabId name pathWithNamespace')
      .lean();

    if (!project?.gitlabId || !project.pathWithNamespace) {
      logger.warn('Chat session project is missing GitLab mapping', {
        projectId,
      });
      return null;
    }

    return {
      databaseId: project._id.toString(),
      gitlabId: project.gitlabId,
      name: project.name,
      pathWithNamespace: project.pathWithNamespace,
    };
  }

  private normalizeToolArguments(
    toolName: string,
    args: Record<string, unknown>,
    projectContext: ProjectToolContext | null
  ): Record<string, unknown> {
    if (!projectContext) {
      return args;
    }

    const normalizedArgs = this.replaceMongoProjectIds(args, projectContext);

    if (this.isRepositoryScopedTool(toolName)) {
      if (!this.hasProjectIdentifier(normalizedArgs)) {
        normalizedArgs.project_id = projectContext.gitlabId;
      }
    }

    return normalizedArgs;
  }

  private replaceMongoProjectIds(
    args: Record<string, unknown>,
    projectContext: ProjectToolContext
  ): Record<string, unknown> {
    const normalizedEntries = Object.entries(args).map(([key, entryValue]) => [
      key,
      this.normalizeNestedValue(entryValue, key, projectContext),
    ]);

    return Object.fromEntries(normalizedEntries);
  }

  private normalizeNestedValue(
    value: unknown,
    key: string | undefined,
    projectContext: ProjectToolContext
  ): unknown {
    if (typeof value === 'string' && key && PROJECT_ID_ARGUMENT_KEYS.has(key)) {
      if (value === projectContext.databaseId) {
        return projectContext.gitlabId;
      }
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.normalizeNestedValue(item, key, projectContext));
    }

    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([nestedKey, nestedValue]) => [
          nestedKey,
          this.normalizeNestedValue(nestedValue, nestedKey, projectContext),
        ])
      );
    }

    return value;
  }

  private hasProjectIdentifier(args: Record<string, unknown>): boolean {
    return args.project_id !== undefined
      || args.projectId !== undefined
      || args.path !== undefined
      || args.path_with_namespace !== undefined;
  }

  private isRepositoryScopedTool(toolName: string): boolean {
    return (
      toolName.includes('repository') ||
      toolName.includes('project') ||
      toolName.includes('branch') ||
      toolName.includes('file') ||
      toolName.includes('commit') ||
      toolName.includes('tree')
    );
  }

  private async publishChunk(payload: {
    sessionId: string;
    content: string;
    done: boolean;
    toolCallInProgress?: string | null;
  }): Promise<void> {
    await chatPubSub.publish(getChatStreamTopic(payload.sessionId), {
      chatStream: payload,
    });
  }
}

export const agentService = new AgentService();
