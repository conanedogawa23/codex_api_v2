import { createModule, gql } from 'graphql-modules';
import { Milestone } from '../../../models/Milestone';
import { AppError } from '../../../middleware';
import { logger } from '../../../utils/logger';

export const milestoneModule = createModule({
  id: 'milestone',
  typeDefs: gql`
    type Milestone {
      id: ID!
      gitlabId: Int!
      projectId: String!
      iid: Int!
      title: String!
      description: String
      state: MilestoneStateType!
      dueDate: DateTime
      startDate: DateTime
      webUrl: String!
      createdAt: DateTime!
      updatedAt: DateTime!
      lastSyncedAt: DateTime!
      isDeleted: Boolean!
    }

    enum MilestoneStateType {
      active
      closed
    }

    input UpdateMilestoneInput {
      title: String
      description: String
      state: MilestoneStateType
      dueDate: DateTime
      startDate: DateTime
    }

    extend type Query {
      milestone(id: ID!): Milestone
      milestoneByGitlabId(gitlabId: Int!): Milestone
      milestones(
        projectId: String
        state: MilestoneStateType
        limit: Int = 20
        offset: Int = 0
      ): [Milestone!]!
      milestonesByProject(projectId: String!, state: MilestoneStateType, limit: Int = 20): [Milestone!]!
    }

    extend type Mutation {
      updateMilestone(id: ID!, input: UpdateMilestoneInput!): Milestone!
    }
  `,
  resolvers: {
    Query: {
      milestone: async (_: any, { id }: { id: string }) => {
        const milestone = await Milestone.findById(id).lean();
        if (!milestone) {
          throw new AppError('Milestone not found', 404);
        }
        return milestone;
      },

      milestoneByGitlabId: async (_: any, { gitlabId }: { gitlabId: number }) => {
        const milestone = await Milestone.findOne({ gitlabId }).lean();
        if (!milestone) {
          throw new AppError(
            `Milestone with GitLab ID ${gitlabId} not found. It may not be synced yet.`,
            404
          );
        }
        return milestone;
      },

      milestones: async (
        _: any,
        { projectId, state, limit = 20, offset = 0 }: any
      ) => {
        const filter: any = {};
        if (projectId) filter.projectId = projectId;
        if (state) filter.state = state;

        return await Milestone.find(filter)
          .limit(limit)
          .skip(offset)
          .sort({ dueDate: 1 })
          .lean();
      },

      milestonesByProject: async (
        _: any,
        { projectId, state, limit = 20 }: { projectId: string; state?: string; limit: number }
      ) => {
        const filter: any = { projectId };
        if (state) filter.state = state;

        return await Milestone.find(filter)
          .limit(limit)
          .sort({ dueDate: 1 })
          .lean();
      },
    },

    Mutation: {
      updateMilestone: async (_: any, { id, input }: any) => {
        const milestone = await Milestone.findByIdAndUpdate(id, input, {
          new: true,
          runValidators: true,
        });
        if (!milestone) {
          throw new AppError('Milestone not found', 404);
        }
        logger.info(`Updated milestone: ${milestone.title}`);
        return milestone;
      },
    },
  },
});
