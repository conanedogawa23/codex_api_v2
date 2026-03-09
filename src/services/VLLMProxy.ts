import OpenAI from 'openai';

import { logger } from '../utils/logger';
import { stripThinkingTokens, ThinkingTokenStreamSanitizer } from '../utils/sanitize';

export interface VLLMToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface VLLMMessage {
  role: 'assistant' | 'system' | 'tool' | 'user';
  content: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

export interface VLLMToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface VLLMChatResponse {
  content: string;
  model: string;
  toolCalls: VLLMToolCall[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

const DEFAULT_BASE_URL = process.env.VLLM_BASE_URL || 'https://dev-vllm.oginnovation.com/v1';
const DEFAULT_API_KEY =
  process.env.VLLM_API_KEY || 'sk-sIsQWuTQWQFzLO4mplGnnYuSt-x5dVy9QORpvLAtgJM';
const DEFAULT_MODEL = process.env.VLLM_MODEL || 'qwen3-30b-a3b-thinking-fp8';
const DEFAULT_TIMEOUT_MS = Number(process.env.VLLM_TIMEOUT_MS || 60000);
const DEFAULT_MAX_RETRIES = Number(process.env.VLLM_MAX_RETRIES || 2);

export class VLLMProxy {
  private readonly client: OpenAI;

  constructor(
    private readonly config = {
      apiKey: DEFAULT_API_KEY,
      baseURL: DEFAULT_BASE_URL,
      maxRetries: DEFAULT_MAX_RETRIES,
      model: DEFAULT_MODEL,
      timeout: DEFAULT_TIMEOUT_MS,
    }
  ) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      timeout: config.timeout,
    });
  }

  public async chatCompletion(options: {
    messages: VLLMMessage[];
    tools?: VLLMToolDefinition[];
    temperature?: number;
    maxTokens?: number;
  }): Promise<VLLMChatResponse> {
    const response = await this.executeWithRetry<any>(
      () =>
        this.client.chat.completions.create({
          model: this.config.model,
          messages: options.messages as any,
          tools: options.tools as any,
          tool_choice: options.tools?.length ? 'auto' : undefined,
          temperature: options.temperature ?? 0.1,
          max_tokens: options.maxTokens ?? 2000,
          stream: false,
        }) as Promise<any>,
      'vLLM chat completion'
    );

    const message = response.choices?.[0]?.message;
    return {
      content: stripThinkingTokens(message?.content || ''),
      model: response.model || this.config.model,
      toolCalls: (message?.tool_calls || []).map((toolCall: any) => ({
        id: toolCall.id,
        name: toolCall.function?.name || 'unknown_tool',
        arguments: toolCall.function?.arguments || '{}',
      })),
      usage: {
        prompt_tokens: response.usage?.prompt_tokens || 0,
        completion_tokens: response.usage?.completion_tokens || 0,
        total_tokens: response.usage?.total_tokens || 0,
      },
    };
  }

  public async *streamChatCompletion(options: {
    messages: VLLMMessage[];
    temperature?: number;
    maxTokens?: number;
  }): AsyncGenerator<string> {
    const sanitizer = new ThinkingTokenStreamSanitizer();

    try {
      const stream = await this.executeWithRetry<any>(
        () =>
          this.client.chat.completions.create({
            model: this.config.model,
            messages: options.messages as any,
            temperature: options.temperature ?? 0.1,
            max_tokens: options.maxTokens ?? 2000,
            stream: true,
          }) as Promise<any>,
        'vLLM streaming completion'
      );

      for await (const chunk of stream as AsyncIterable<{
        choices?: Array<{ delta?: { content?: string } }>;
      }>) {
        const content = chunk.choices?.[0]?.delta?.content || '';
        const sanitizedChunk = sanitizer.push(content);
        if (sanitizedChunk) {
          yield sanitizedChunk;
        }
      }

      const remaining = sanitizer.flush();
      if (remaining) {
        yield remaining;
      }
    } catch (error) {
      logger.warn('Streaming vLLM call failed, falling back to non-streaming', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      const fallback = await this.chatCompletion({
        messages: options.messages,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
      });

      if (fallback.content) {
        yield fallback.content;
      }
    }
  }

  private async executeWithRetry<T>(operation: () => Promise<T>, label: string): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt += 1) {
      let timeoutHandle: NodeJS.Timeout | undefined;

      try {
        const timeoutPromise = new Promise<T>((_, reject) => {
          timeoutHandle = setTimeout(
            () => reject(new Error(`${label} timed out after ${this.config.timeout}ms`)),
            this.config.timeout
          );
        });

        try {
          return await Promise.race([operation(), timeoutPromise]);
        } finally {
          if (timeoutHandle) {
            clearTimeout(timeoutHandle);
          }
        }
      } catch (error) {
        lastError = error;
        if (!this.shouldRetry(error) || attempt === this.config.maxRetries) {
          throw error instanceof Error ? error : new Error(`${label} failed`);
        }

        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }

    throw lastError instanceof Error ? lastError : new Error(`${label} failed`);
  }

  private shouldRetry(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    const message = error.message.toLowerCase();
    return (
      message.includes('gateway') ||
      message.includes('503') ||
      message.includes('502') ||
      message.includes('504') ||
      message.includes('fetch failed') ||
      message.includes('network')
    );
  }
}

export const vllmProxy = new VLLMProxy();
