import { createModule, gql } from 'graphql-modules';
import { MergeRequest } from '../../../models/MergeRequest';
import { AppError } from '../../../middleware';
import { logger } from '../../../utils/logger';

export const mergeRequestModule = createModule({
  id: 'mergeRequest',
  typeDefs: gql`
    type MergeRequest {
      id: ID!
      gitlabId: Int!
      iid: Int!
      projectId: Int!
      title: String!
      description: String
      state: MergeRequestState!
      mergeStatus: MergeStatus!
      sourceBranch: String!
      targetBranch: String!
      labels: [String!]!
      milestone: MRMilestone
      assignees: [MRUser!]!
      reviewers: [MRUser!]!
      author: MRUser!
      webUrl: String!
      createdAt: DateTime!
      updatedAt: DateTime!
      mergedAt: DateTime
      closedAt: DateTime
      firstDeployedToProductionAt: DateTime
      lastSynced: DateTime!
      isActive: Boolean!
    }

    type MRMilestone {
      id: Int!
      title: String!
      description: String
      state: String!
      dueDate: DateTime
    }

    type MRUser {
      id: Int!
      name: String!
      username: String!
      email: String
      avatarUrl: String
    }

    enum MergeRequestState {
      opened
      closed
      locked
      merged
    }

    enum MergeStatus {
      can_be_merged
      cannot_be_merged
      unchecked
    }

    input UpdateMergeRequestInput {
      title: String
      description: String
      targetBranch: String
    }

    extend type Query {
      mergeRequest(id: ID!): MergeRequest
      mergeRequestByGitlabId(gitlabId: Int!): MergeRequest
      mergeRequests(
        projectId: Int
        state: MergeRequestState
        sourceBranch: String
        targetBranch: String
        authorId: Int
        limit: Int = 20
        offset: Int = 0
      ): [MergeRequest!]!
      mergeRequestsByProject(projectId: Int!, state: MergeRequestState, limit: Int = 20): [MergeRequest!]!
    }

    extend type Mutation {
      updateMergeRequest(id: ID!, input: UpdateMergeRequestInput!): MergeRequest!
    }
  `,
  resolvers: {
    MergeRequest: {
      id: (parent: any) => parent._id?.toString() || parent.id,
    },
    
    Query: {
      mergeRequest: async (_: any, { id }: { id: string }) => {
        const mr = await MergeRequest.findById(id).lean();
        if (!mr) {
          throw new AppError('Merge request not found', 404);
        }
        return mr;
      },

      mergeRequestByGitlabId: async (_: any, { gitlabId }: { gitlabId: number }) => {
        const mr = await MergeRequest.findByGitlabId(gitlabId);
        if (!mr) {
          throw new AppError(
            `Merge request with GitLab ID ${gitlabId} not found. It may not be synced yet.`,
            404
          );
        }
        return mr;
      },

      mergeRequests: async (
        _: any,
        { projectId, state, sourceBranch, targetBranch, authorId, limit = 20, offset = 0 }: any
      ) => {
        const filter: any = {};
        if (projectId) filter.projectId = projectId;
        if (state) filter.state = state;
        if (sourceBranch) filter.sourceBranch = sourceBranch;
        if (targetBranch) filter.targetBranch = targetBranch;
        if (authorId) filter['author.id'] = authorId;

        return await MergeRequest.find(filter)
          .limit(limit)
          .skip(offset)
          .sort({ updatedAt: -1 })
          .lean();
      },

      mergeRequestsByProject: async (
        _: any,
        { projectId, state, limit = 20 }: { projectId: number; state?: string; limit: number }
      ) => {
        const filter: any = { projectId };
        if (state) filter.state = state;

        return await MergeRequest.find(filter)
          .limit(limit)
          .sort({ updatedAt: -1 })
          .lean();
      },
    },

    Mutation: {
      updateMergeRequest: async (_: any, { id, input }: any) => {
        const mr = await MergeRequest.findByIdAndUpdate(id, input, {
          new: true,
          runValidators: true,
        });
        if (!mr) {
          throw new AppError('Merge request not found', 404);
        }
        logger.info(`Updated merge request: ${mr.title}`);
        return mr;
      },
    },
  },
});
