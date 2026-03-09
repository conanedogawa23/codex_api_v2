import { PubSub } from 'graphql-subscriptions';

export interface ChatStreamEvent {
  sessionId: string;
  content: string;
  done: boolean;
  toolCallInProgress?: string | null;
}

export function getChatStreamTopic(sessionId: string): string {
  return `CHAT_STREAM_TOPIC:${sessionId}`;
}

export const chatPubSub = new PubSub<{
  [topic: string]: { chatStream: ChatStreamEvent };
}>();
