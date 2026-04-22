import { createModule, gql } from 'graphql-modules';
import { Event } from '../../../models/Event';
import { User } from '../../../models/User';
import { AppError } from '../../../middleware';
import { GraphQLContext, requireCurrentUser } from '../../../utils/auth';
import { logger } from '../../../utils/logger';
import { requireProjectAccess, withProjectFilter } from '../../../utils/rbac';

export const eventModule = createModule({
  id: 'event',
  typeDefs: gql`
    type Event {
      id: ID!
      gitlabId: Int!
      projectId: String
      authorId: ID
      authorUsername: String
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
    Event: {
      id: (parent: any) => parent._id?.toString() || parent.id,
      authorUsername: async (parent: any) => {
        if (!parent.authorId) {
          return null;
        }

        const user = await User.findById(parent.authorId).select('username name').lean();
        return user?.username || user?.name || null;
      },
    },
    
    Query: {
      event: async (_: any, { id }: { id: string }, context: GraphQLContext) => {
        requireCurrentUser(context);
        logger.info('Fetching event by ID', { id });
        
        const event = await Event.findById(id).lean();
        
        if (!event) {
          throw new AppError(`Event with ID ${id} not found`, 404);
        }

        await requireProjectAccess(context, event.projectId, 'gitlab');
        
        return event;
      },

      eventByGitlabId: async (_: any, { gitlabId }: { gitlabId: number }, context: GraphQLContext) => {
        requireCurrentUser(context);
        logger.info('Fetching event by GitLab ID', { gitlabId });
        
        const event = await Event.findOne({ gitlabId, isDeleted: false }).lean();
        
        if (!event) {
          throw new AppError(
            `Event with GitLab ID ${gitlabId} not found. It may not be synced yet.`,
            404
          );
        }

        await requireProjectAccess(context, event.projectId, 'gitlab');
        
        return event;
      },

      events: async (
        _: any,
        { projectId, limit, offset }: { projectId?: string; limit: number; offset: number },
        context: GraphQLContext
      ) => {
        requireCurrentUser(context);
        logger.info('Fetching events', { projectId, limit, offset });
        
        const filter: any = { isDeleted: false };
        if (projectId) filter.projectId = projectId;
        const scopedFilter = await withProjectFilter(context, filter, 'projectId', 'gitlab');
        
        return await Event.find(scopedFilter)
          .limit(limit)
          .skip(offset)
          .sort({ createdAt: -1 })
          .lean();
      },

      eventsByUser: async (
        _: any,
        { userId, limit, offset }: { userId: string; limit: number; offset: number },
        context: GraphQLContext
      ) => {
        const currentUser = requireCurrentUser(context);
        if (userId !== currentUser.userId && !currentUser.isSuperAdmin) {
          throw new AppError('Forbidden', 403);
        }
        logger.info('Fetching events by user', { userId, limit, offset });

        const filter = await withProjectFilter(
          context,
          { authorId: userId, isDeleted: false },
          'projectId',
          'gitlab'
        );

        return await Event.find(filter)
          .limit(limit)
          .skip(offset)
          .sort({ createdAt: -1 })
          .lean();
      },

      recentEvents: async (_: any, { limit }: { limit: number }, context: GraphQLContext) => {
        requireCurrentUser(context);
        logger.info('Fetching recent events', { limit });

        const filter = await withProjectFilter(
          context,
          { isDeleted: false },
          'projectId',
          'gitlab'
        );

        return await Event.find(filter)
          .limit(limit)
          .sort({ createdAt: -1 })
          .lean();
      },

      eventsByAction: async (
        _: any,
        { actionName, limit, offset }: { actionName: string; limit: number; offset: number },
        context: GraphQLContext
      ) => {
        requireCurrentUser(context);
        logger.info('Fetching events by action', { actionName, limit, offset });

        const filter = await withProjectFilter(
          context,
          { actionName, isDeleted: false },
          'projectId',
          'gitlab'
        );

        return await Event.find(filter)
          .limit(limit)
          .skip(offset)
          .sort({ createdAt: -1 })
          .lean();
      },
    },
  },
});
