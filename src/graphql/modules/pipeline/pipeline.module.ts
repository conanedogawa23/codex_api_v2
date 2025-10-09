import { createModule, gql } from 'graphql-modules';
import { Pipeline } from '../../../models/Pipeline';
import { AppError } from '../../../middleware';
import { logger } from '../../../utils/logger';

export const pipelineModule = createModule({
  id: 'pipeline',
  typeDefs: gql`
    type Pipeline {
      id: ID!
      gitlabId: Int!
      projectId: String!
      ref: String!
      sha: String!
      status: PipelineStatus!
      source: String!
      beforeSha: String
      tag: Boolean!
      webUrl: String!
      duration: Int
      queuedDuration: Int
      coverage: Float
      createdAt: DateTime!
      updatedAt: DateTime!
      startedAt: DateTime
      finishedAt: DateTime
      committedAt: DateTime
      lastSyncedAt: DateTime!
      isDeleted: Boolean!
    }

    enum PipelineStatus {
      created
      waiting_for_resource
      preparing
      pending
      running
      success
      failed
      canceled
      skipped
      manual
      scheduled
    }

    extend type Query {
      pipeline(id: ID!): Pipeline
      pipelineByGitlabId(gitlabId: Int!): Pipeline
      pipelines(
        projectId: String
        status: PipelineStatus
        ref: String
        limit: Int = 20
        offset: Int = 0
      ): [Pipeline!]!
      pipelinesByProject(projectId: String!, status: PipelineStatus, limit: Int = 20): [Pipeline!]!
    }
  `,
  resolvers: {
    Pipeline: {
      id: (parent: any) => parent._id?.toString() || parent.id,
    },
    
    Query: {
      pipeline: async (_: any, { id }: { id: string }) => {
        const pipeline = await Pipeline.findById(id).lean();
        if (!pipeline) {
          throw new AppError('Pipeline not found', 404);
        }
        return pipeline;
      },

      pipelineByGitlabId: async (_: any, { gitlabId }: { gitlabId: number }) => {
        const pipeline = await Pipeline.findOne({ gitlabId }).lean();
        if (!pipeline) {
          throw new AppError(
            `Pipeline with GitLab ID ${gitlabId} not found. It may not be synced yet.`,
            404
          );
        }
        return pipeline;
      },

      pipelines: async (
        _: any,
        { projectId, status, ref, limit = 20, offset = 0 }: any
      ) => {
        const filter: any = {};
        if (projectId) filter.projectId = projectId;
        if (status) filter.status = status;
        if (ref) filter.ref = ref;

        return await Pipeline.find(filter)
          .limit(limit)
          .skip(offset)
          .sort({ createdAt: -1 })
          .lean();
      },

      pipelinesByProject: async (
        _: any,
        { projectId, status, limit = 20 }: { projectId: string; status?: string; limit: number }
      ) => {
        const filter: any = { projectId };
        if (status) filter.status = status;

        return await Pipeline.find(filter)
          .limit(limit)
          .sort({ createdAt: -1 })
          .lean();
      },
    },
  },
});
