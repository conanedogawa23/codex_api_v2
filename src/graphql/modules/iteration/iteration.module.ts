import { createModule, gql } from 'graphql-modules';
import { Iteration } from '../../../models/Iteration';
import { AppError } from '../../../middleware';
import { logger } from '../../../utils/logger';

export const iterationModule = createModule({
  id: 'iteration',
  typeDefs: gql`
    type Iteration {
      id: ID!
      gitlabId: Int!
      groupId: Int!
      iid: Int!
      sequence: Int!
      title: String!
      description: String
      state: IterationState!
      webUrl: String!
      startDate: DateTime!
      dueDate: DateTime!
      createdAt: DateTime!
      updatedAt: DateTime!
      lastSyncedAt: DateTime!
      isDeleted: Boolean!
    }

    enum IterationState {
      upcoming
      current
      opened
      closed
    }

    extend type Query {
      iteration(id: ID!): Iteration
      iterationByGitlabId(gitlabId: Int!): Iteration
      iterations(groupId: Int!, state: IterationState, limit: Int = 20, offset: Int = 0): [Iteration!]!
      activeIterations(groupId: Int!): [Iteration!]!
      currentIteration(groupId: Int!): Iteration
    }
  `,
  resolvers: {
    Iteration: {
      id: (parent: any) => parent._id?.toString() || parent.id,
    },
    
    Query: {
      iteration: async (_: any, { id }: { id: string }) => {
        logger.info('Fetching iteration by ID', { id });
        
        const iteration = await Iteration.findById(id).lean();
        
        if (!iteration) {
          throw new AppError(`Iteration with ID ${id} not found`, 404);
        }
        
        return iteration;
      },

      iterationByGitlabId: async (_: any, { gitlabId }: { gitlabId: number }) => {
        logger.info('Fetching iteration by GitLab ID', { gitlabId });
        
        const iteration = await Iteration.findOne({ gitlabId, isDeleted: false }).lean();
        
        if (!iteration) {
          throw new AppError(
            `Iteration with GitLab ID ${gitlabId} not found. It may not be synced yet.`,
            404
          );
        }
        
        return iteration;
      },

      iterations: async (_: any, { groupId, state, limit, offset }: { groupId: number; state?: string; limit: number; offset: number }) => {
        logger.info('Fetching iterations', { groupId, state, limit, offset });
        
        const filter: any = { groupId, isDeleted: false };
        if (state) filter.state = state;
        
        return await Iteration.find(filter)
          .limit(limit)
          .skip(offset)
          .sort({ startDate: -1 })
          .lean();
      },

      activeIterations: async (_: any, { groupId }: { groupId: number }) => {
        logger.info('Fetching active iterations', { groupId });
        
        const now = new Date();
        
        return await Iteration.find({
          groupId,
          state: { $nin: ['closed'] },
          startDate: { $lte: now },
          dueDate: { $gte: now },
          isDeleted: false
        })
          .sort({ startDate: 1 })
          .lean();
      },

      currentIteration: async (_: any, { groupId }: { groupId: number }) => {
        logger.info('Fetching current iteration', { groupId });
        
        const iteration = await Iteration.findOne({
          groupId,
          state: 'current',
          isDeleted: false
        })
          .sort({ startDate: -1 })
          .lean();
        
        if (!iteration) {
          throw new AppError(`No current iteration found for group ${groupId}`, 404);
        }
        
        return iteration;
      },
    },
  },
});
