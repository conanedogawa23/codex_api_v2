import { createModule, gql } from 'graphql-modules';
import { Milestone } from '../../../models/Milestone';
import { AppError } from '../../../middleware';
import { GraphQLContext, requireCurrentUser } from '../../../utils/auth';
import { logger } from '../../../utils/logger';
import { requireProjectAccess, withProjectFilter } from '../../../utils/rbac';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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

    type MilestonesResult {
      milestones: [Milestone!]!
      totalCount: Int!
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
        search: String
      ): MilestonesResult!
      milestonesByProject(projectId: String!, state: MilestoneStateType, limit: Int = 20): [Milestone!]!
    }

    extend type Mutation {
      updateMilestone(id: ID!, input: UpdateMilestoneInput!): Milestone!
    }
  `,
  resolvers: {
    Milestone: {
      id: (parent: any) => parent._id?.toString() || parent.id,
    },
    
    Query: {
      milestone: async (_: any, { id }: { id: string }, context: GraphQLContext) => {
        requireCurrentUser(context);
        const milestone = await Milestone.findById(id).lean();
        if (!milestone) {
          throw new AppError('Milestone not found', 404);
        }

        await requireProjectAccess(context, milestone.projectId, 'gitlab');
        return milestone;
      },

      milestoneByGitlabId: async (_: any, { gitlabId }: { gitlabId: number }, context: GraphQLContext) => {
        requireCurrentUser(context);
        const milestone = await Milestone.findOne({ gitlabId }).lean();
        if (!milestone) {
          throw new AppError(
            `Milestone with GitLab ID ${gitlabId} not found. It may not be synced yet.`,
            404
          );
        }

        await requireProjectAccess(context, milestone.projectId, 'gitlab');
        return milestone;
      },

      milestones: async (
        _: any,
        { projectId, state, limit = 20, offset = 0, search }: any,
        context: GraphQLContext
      ) => {
        requireCurrentUser(context);
        const filter: any = {};
        if (projectId) filter.projectId = projectId;
        if (state) filter.state = state;
        if (search?.trim()) {
          const escapedSearch = escapeRegex(search.trim());
          filter.$or = [
            { title: { $regex: escapedSearch, $options: 'i' } },
            { description: { $regex: escapedSearch, $options: 'i' } },
          ];
        }
        const scopedFilter = await withProjectFilter(context, filter, 'projectId', 'gitlab');

        const [milestones, totalCount] = await Promise.all([
          Milestone.find(scopedFilter)
            .limit(limit)
            .skip(offset)
            .sort({ dueDate: 1 })
            .lean(),
          Milestone.countDocuments(scopedFilter),
        ]);

        return {
          milestones,
          totalCount,
        };
      },

      milestonesByProject: async (
        _: any,
        { projectId, state, limit = 20 }: { projectId: string; state?: string; limit: number },
        context: GraphQLContext
      ) => {
        requireCurrentUser(context);
        const filter: any = { projectId };
        if (state) filter.state = state;
        const scopedFilter = await withProjectFilter(context, filter, 'projectId', 'gitlab');

        return await Milestone.find(scopedFilter)
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
