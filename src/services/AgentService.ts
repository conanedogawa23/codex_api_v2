import mongoose from 'mongoose';

import { AppError } from '../middleware';
import { Project } from '../models/Project';
import { ChatSession, IChatMessage } from '../models/ChatSession';
import { logger } from '../utils/logger';
import { AuthenticatedUser } from '../utils/auth';

import { chatPubSub, getChatStreamTopic } from './chatPubSub';
import { mcpBridge } from './MCPBridge';
import { VLLMMessage, VLLMToolChoice, VLLMToolDefinition, vllmProxy } from './VLLMProxy';

const MAX_TOOL_ITERATIONS = 10;
const PROJECT_ID_ARGUMENT_KEYS = new Set(['project_id', 'projectId', 'source_project_id', 'target_project_id']);
const REPOSITORY_READING_TOOL_NAME = 'get_file_contents';
const REPOSITORY_TREE_TOOL_NAME = 'get_repository_tree';
const REPOSITORY_INSPECTION_TOOL_NAMES = new Set([REPOSITORY_READING_TOOL_NAME, REPOSITORY_TREE_TOOL_NAME]);
const REPOSITORY_INSPECTION_PATTERNS = [
  /\bcode\b/i,
  /\bfile\b/i,
  /\bfiles\b/i,
  /\bfunction\b/i,
  /\bclass\b/i,
  /\bmodule\b/i,
  /\bservice\b/i,
  /\bcomponent\b/i,
  /\bschema\b/i,
  /\bresolver\b/i,
  /\bconfig\b/i,
  /\bimplementation\b/i,
  /\bsource\b/i,
  /\bimport\b/i,
  /\bexport\b/i,
  /\broute\b/i,
  /\bendpoint\b/i,
  /\bfolder\b/i,
  /\bdirectory\b/i,
  /\bpath\b/i,
  /\brepository structure\b/i,
  /\bhow does\b/i,
  /\bwhere (?:is|are|does|do)\b/i,
  /\bsearch\b/i,
  /\bscan\b/i,
  /\btrace\b/i,
  /\bdebug\b/i,
  /\berror\b/i,
  /\bstack trace\b/i,
  /\bpackage\.json\b/i,
  /\btsconfig\b/i,
  /\bDockerfile\b/i,
  /\bREADME\b/i,
];

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
    const latestUserMessage = this.getLatestUserMessage(session.messages);
    const mustInspectRepository = this.shouldInspectRepository(latestUserMessage, projectContext, tools);
    const messages: VLLMMessage[] = [
      this.buildSystemMessage(currentUser, projectContext),
      ...this.toVLLMMessages(session.messages),
    ];

    let iterations = 0;
    let repositoryInspected = false;

    try {
      while (iterations < MAX_TOOL_ITERATIONS) {
        iterations += 1;

        const response = await vllmProxy.chatCompletion({
          messages,
          tools,
          toolChoice: this.resolveToolChoice(tools, mustInspectRepository, repositoryInspected),
          temperature: 0,
          maxTokens: 2000,
        });

        if (response.toolCalls.length === 0) {
          if (mustInspectRepository && !repositoryInspected) {
            messages.push({
              role: 'user',
              content: [
                'Before answering, explore the repository to find the relevant source files.',
                'IMPORTANT: Start by calling get_repository_tree to list the top-level directory structure.',
                'Then drill into subdirectories to locate the exact files (especially for Java/Kotlin projects with deep package paths like src/main/java/...).',
                'Only call get_file_contents once you have a confirmed file path (not a directory path).',
                'Do not guess file paths or answer from memory alone.',
              ].join(' '),
            });
            continue;
          }

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
          if (REPOSITORY_INSPECTION_TOOL_NAMES.has(toolCall.name)) {
            repositoryInspected = true;
          }

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
      '',
      '## Repository exploration strategy',
      'When the user asks about code, files, structure, or implementation:',
      '1. ALWAYS start with get_repository_tree to list the top-level directory structure of the project.',
      '2. Drill down into relevant subdirectories by calling get_repository_tree with a path parameter (e.g. "src", "src/main/java/com/og/loyalty").',
      '3. Only call get_file_contents once you have confirmed a full file path ending in an actual file name (e.g. "src/main/java/com/og/loyalty/controller/LoyaltyController.java"), NEVER with a directory path.',
      '4. If get_file_contents returns an error about "File not found" or a directory, fall back to get_repository_tree on that path to list its contents.',
      '5. For Java/Kotlin/Gradle projects, package directories are deeply nested — always explore the tree incrementally rather than guessing full paths.',
      '',
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

  private getLatestUserMessage(messages: IChatMessage[]): string | null {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index].role === 'user') {
        return messages[index].content;
      }
    }

    return null;
  }

  private shouldInspectRepository(
    latestUserMessage: string | null,
    projectContext: ProjectToolContext | null,
    tools: VLLMToolDefinition[]
  ): boolean {
    if (!latestUserMessage || !projectContext) {
      return false;
    }

    const hasInspectionTool = tools.some((tool) =>
      REPOSITORY_INSPECTION_TOOL_NAMES.has(tool.function.name)
    );
    if (!hasInspectionTool) {
      return false;
    }

    return REPOSITORY_INSPECTION_PATTERNS.some((pattern) => pattern.test(latestUserMessage));
  }

  private resolveToolChoice(
    tools: VLLMToolDefinition[],
    mustInspectRepository: boolean,
    repositoryInspected: boolean
  ): VLLMToolChoice | undefined {
    if (!tools.length) {
      return undefined;
    }

    if (mustInspectRepository && !repositoryInspected) {
      const hasTreeTool = tools.some((tool) => tool.function.name === REPOSITORY_TREE_TOOL_NAME);
      if (hasTreeTool) {
        return {
          type: 'function',
          function: {
            name: REPOSITORY_TREE_TOOL_NAME,
          },
        };
      }
    }

    return 'auto';
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
