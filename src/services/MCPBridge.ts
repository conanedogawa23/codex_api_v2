import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

import { logger } from '../utils/logger';

import type { VLLMToolDefinition } from './VLLMProxy';

interface MCPTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

const DEFAULT_GITLAB_MCP_COMMAND = process.env.GITLAB_MCP_COMMAND || 'npx';
const DEFAULT_GITLAB_MCP_ARGS = process.env.GITLAB_MCP_ARGS
  ? process.env.GITLAB_MCP_ARGS.split(' ')
  : ['-y', '@zereight/mcp-gitlab'];

export class MCPBridge {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private toolsCache: MCPTool[] | null = null;

  public async listTools(): Promise<MCPTool[]> {
    await this.ensureConnected();

    if (this.toolsCache) {
      return this.toolsCache;
    }

    const tools: MCPTool[] = [];
    let cursor: string | undefined;

    do {
      const response = await this.client!.listTools({ cursor });
      tools.push(...response.tools);
      cursor = response.nextCursor;
    } while (cursor);

    this.toolsCache = tools;
    return tools;
  }

  public async listToolsAsVLLMFunctions(): Promise<VLLMToolDefinition[]> {
    const tools = await this.listTools();

    return tools.map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description || `GitLab MCP tool: ${tool.name}`,
        parameters: tool.inputSchema || {
          type: 'object',
          properties: {},
        },
      },
    }));
  }

  public async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    await this.ensureConnected();

    let result: {
      content: Array<{ type: string; text?: string }>;
      structuredContent?: unknown;
    };

    try {
      result = (await this.client!.callTool({
        name,
        arguments: args,
      })) as typeof result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn('MCP tool call failed, returning error to model', {
        tool: name,
        args,
        error: errorMessage,
      });
      return `[Tool Error] ${name} failed: ${errorMessage}. Try a different approach — use get_repository_tree to list directory contents, or verify the file path exists before reading it.`;
    }

    const textContent = result.content
      .filter((item: { type: string }) => item.type === 'text')
      .map((item: { text?: string }) => item.text || '')
      .join('\n')
      .trim();

    if (result.structuredContent) {
      return JSON.stringify(result.structuredContent);
    }

    return textContent || JSON.stringify(result.content);
  }

  public async dispose(): Promise<void> {
    this.toolsCache = null;

    if (this.client) {
      await this.client.close();
    }

    this.client = null;
    this.transport = null;
  }

  private async ensureConnected(): Promise<void> {
    if (this.client && this.transport) {
      return;
    }

    this.client = new Client({
      name: 'codex-api-v2',
      version: '2.0.0',
    });

    this.transport = new StdioClientTransport({
      command: DEFAULT_GITLAB_MCP_COMMAND,
      args: DEFAULT_GITLAB_MCP_ARGS,
      env: {
        ...process.env,
        GITLAB_PERSONAL_ACCESS_TOKEN:
          process.env.GITLAB_PERSONAL_ACCESS_TOKEN || '',
        GITLAB_API_URL: process.env.GITLAB_API_URL || 'https://codex.oginnovation.com/api/v4/',
        GITLAB_READ_ONLY_MODE: process.env.GITLAB_READ_ONLY_MODE || 'false',
        USE_GITLAB_WIKI: process.env.USE_GITLAB_WIKI || 'true',
        USE_MILESTONE: process.env.USE_MILESTONE || 'true',
        USE_PIPELINE: process.env.USE_PIPELINE || 'true',
      },
    });

    await this.client.connect(this.transport);
    this.toolsCache = null;

    logger.info('Connected to GitLab MCP sidecar');
  }
}

export const mcpBridge = new MCPBridge();
