import { createModule, gql } from 'graphql-modules';
import { Event } from '../../../models/Event';
import { AppError } from '../../../middleware';
import { logger } from '../../../utils/logger';

export const eventModule = createModule({
  id: 'event',
  typeDefs: gql`
    type Event {
      id: ID!
      gitlabId: Int!
      projectId: String
      authorId: ID
      actionName: String!
      targetType: String
      targetId: Int
      targetTitle: String
      createdAt: DateTime!
      pushData: PushData
      note: JSON
      lastSyncedAt: DateTime!
      isDeleted: Boolean!
    }

    type PushData {
      commitCount: Int!
      action: String!
      refType: String!
      commitFrom: String
      commitTo: String
      ref: String
      commitTitle: String
    }

    extend type Query {
      event(id: ID!): Event
      eventByGitlabId(gitlabId: Int!): Event
      events(projectId: String, limit: Int = 20, offset: Int = 0): [Event!]!
      eventsByUser(userId: ID!, limit: Int = 20, offset: Int = 0): [Event!]!
      recentEvents(limit: Int = 20): [Event!]!
      eventsByAction(actionName: String!, limit: Int = 20, offset: Int = 0): [Event!]!
    }
  `,
  resolvers: {
    Query: {
      event: async (_: any, { id }: { id: string }) => {
        logger.info('Fetching event by ID', { id });
        
        const event = await Event.findById(id).lean();
        
        if (!event) {
          throw new AppError(`Event with ID ${id} not found`, 404);
        }
        
        return event;
      },

      eventByGitlabId: async (_: any, { gitlabId }: { gitlabId: number }) => {
        logger.info('Fetching event by GitLab ID', { gitlabId });
        
        const event = await Event.findOne({ gitlabId, isDeleted: false }).lean();
        
        if (!event) {
          throw new AppError(
            `Event with GitLab ID ${gitlabId} not found. It may not be synced yet.`,
            404
          );
        }
        
        return event;
      },

      events: async (_: any, { projectId, limit, offset }: { projectId?: string; limit: number; offset: number }) => {
        logger.info('Fetching events', { projectId, limit, offset });
        
        const filter: any = { isDeleted: false };
        if (projectId) filter.projectId = projectId;
        
        return await Event.find(filter)
          .limit(limit)
          .skip(offset)
          .sort({ createdAt: -1 })
          .lean();
      },

      eventsByUser: async (_: any, { userId, limit, offset }: { userId: string; limit: number; offset: number }) => {
        logger.info('Fetching events by user', { userId, limit, offset });
        
        return await Event.find({ authorId: userId, isDeleted: false })
          .limit(limit)
          .skip(offset)
          .sort({ createdAt: -1 })
          .lean();
      },

      recentEvents: async (_: any, { limit }: { limit: number }) => {
        logger.info('Fetching recent events', { limit });
        
        return await Event.find({ isDeleted: false })
          .limit(limit)
          .sort({ createdAt: -1 })
          .lean();
      },

      eventsByAction: async (_: any, { actionName, limit, offset }: { actionName: string; limit: number; offset: number }) => {
        logger.info('Fetching events by action', { actionName, limit, offset });
        
        return await Event.find({ actionName, isDeleted: false })
          .limit(limit)
          .skip(offset)
          .sort({ createdAt: -1 })
          .lean();
      },
    },
  },
});
