import { createModule, gql } from 'graphql-modules';
import mongoose from 'mongoose';

import { AppError } from '../../../middleware';
import { ChatSession, IChatSession } from '../../../models/ChatSession';
import { agentService } from '../../../services/AgentService';
import { chatPubSub, getChatStreamTopic } from '../../../services/chatPubSub';
import { GraphQLContext, requireCurrentUser } from '../../../utils/auth';
import { logger } from '../../../utils/logger';

function toChatSession(session: IChatSession | (IChatSession & { _id: mongoose.Types.ObjectId })) {
  return {
    id: session._id.toString(),
    title: session.title,
    projectId: session.projectId?.toString() || null,
    messages: session.messages.map((message) => ({
      role: message.role,
      content: message.content,
      toolCalls: message.toolCalls || null,
      timestamp: message.timestamp,
    })),
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

function createSessionTitle(content: string): string {
  const trimmed = content.trim().replace(/\s+/g, ' ');
  return trimmed.length <= 60 ? trimmed : `${trimmed.slice(0, 57)}...`;
}

export const chatModule = createModule({
  id: 'chat',
  typeDefs: gql`
    type ChatMessage {
      role: String!
      content: String!
      toolCalls: JSON
      timestamp: DateTime!
    }

    type ChatSession {
      id: ID!
      title: String!
      messages: [ChatMessage!]!
      projectId: ID
      createdAt: DateTime!
      updatedAt: DateTime!
    }

    type ChatStreamChunk {
      sessionId: ID!
      content: String!
      done: Boolean!
      toolCallInProgress: String
    }

    extend type Query {
      chatSessions(projectId: ID, limit: Int = 20): [ChatSession!]!
      chatSession(id: ID!): ChatSession
    }

    extend type Mutation {
      sendChatMessage(sessionId: ID, projectId: ID, content: String!): ChatSession!
    }

    extend type Subscription {
      chatStream(sessionId: ID!): ChatStreamChunk!
    }
  `,
  resolvers: {
    Query: {
      chatSessions: async (
        _: unknown,
        { projectId, limit = 20 }: { projectId?: string; limit?: number },
        context: GraphQLContext
      ) => {
        const currentUser = requireCurrentUser(context);
        const sessions = await ChatSession.findByUser(
          currentUser.userId,
          projectId,
          Math.min(Math.max(limit, 1), 50)
        );

        return sessions.map((session) => toChatSession(session as unknown as IChatSession));
      },
      chatSession: async (_: unknown, { id }: { id: string }, context: GraphQLContext) => {
        const currentUser = requireCurrentUser(context);
        const session = await ChatSession.findOne({
          _id: id,
          userId: new mongoose.Types.ObjectId(currentUser.userId),
        }).lean();

        if (!session) {
          throw new AppError('Chat session not found', 404);
        }

        return toChatSession(session as unknown as IChatSession);
      },
    },
    Mutation: {
      sendChatMessage: async (
        _: unknown,
        {
          content,
          projectId,
          sessionId,
        }: { content: string; projectId?: string; sessionId?: string },
        context: GraphQLContext
      ) => {
        const currentUser = requireCurrentUser(context);
        const trimmedContent = content.trim();

        if (!trimmedContent) {
          throw new AppError('Message content is required', 400);
        }

        let session = sessionId
          ? await ChatSession.findOne({
              _id: sessionId,
              userId: new mongoose.Types.ObjectId(currentUser.userId),
            })
          : null;

        if (!session) {
          session = new ChatSession({
            userId: new mongoose.Types.ObjectId(currentUser.userId),
            projectId:
              projectId && mongoose.Types.ObjectId.isValid(projectId)
                ? new mongoose.Types.ObjectId(projectId)
                : undefined,
            title: createSessionTitle(trimmedContent),
            messages: [],
          });
        }

        session.messages.push({
          role: 'user',
          content: trimmedContent,
          timestamp: new Date(),
        });
        await session.save();

        logger.info('Queued chat session execution', {
          sessionId: session.id,
          userId: currentUser.userId,
          projectId: session.projectId?.toString(),
        });

        setTimeout(() => {
          void agentService.executeSession(session!.id, currentUser).catch((error) => {
            const message =
              error instanceof Error ? error.message : 'I ran into an unexpected error while processing your request.';

            logger.error('Background chat execution failed', {
              error: message,
              sessionId: session!.id,
              userId: currentUser.userId,
            });

            void chatPubSub.publish(getChatStreamTopic(session!.id), {
              chatStream: {
                sessionId: session!.id,
                content: `I ran into an error while processing your request: ${message}`,
                done: true,
                toolCallInProgress: null,
              },
            });
          });
        }, 1000);

        return toChatSession(session);
      },
    },
    Subscription: {
      chatStream: {
        subscribe: (_: unknown, variables: { sessionId: string }, context: GraphQLContext) => {
          requireCurrentUser(context);
          return chatPubSub.asyncIterableIterator(getChatStreamTopic(variables.sessionId));
        },
        resolve: (payload: { chatStream: unknown }) => payload.chatStream,
      },
    },
  },
});
