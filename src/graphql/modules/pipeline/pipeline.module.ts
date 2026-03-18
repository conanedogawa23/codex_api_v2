import { createModule, gql } from 'graphql-modules';
import { Pipeline } from '../../../models/Pipeline';
import { AppError } from '../../../middleware';
import { GraphQLContext, requireCurrentUser } from '../../../utils/auth';
import { logger } from '../../../utils/logger';
import { requireProjectAccess, withProjectFilter } from '../../../utils/rbac';

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

    type PipelinesByProjectResult {
      pipelines: [Pipeline!]!
      totalCount: Int!
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
      pipelinesByProject(projectId: String!, status: PipelineStatus, limit: Int = 20, offset: Int = 0): PipelinesByProjectResult!
    }
  `,
  resolvers: {
    Pipeline: {
      id: (parent: any) => parent._id?.toString() || parent.id,
    },
    
    Query: {
      pipeline: async (_: any, { id }: { id: string }, context: GraphQLContext) => {
        requireCurrentUser(context);
        const pipeline = await Pipeline.findById(id).lean();
        if (!pipeline) {
          throw new AppError('Pipeline not found', 404);
        }

        await requireProjectAccess(context, pipeline.projectId, 'gitlab');
        return pipeline;
      },

      pipelineByGitlabId: async (_: any, { gitlabId }: { gitlabId: number }, context: GraphQLContext) => {
        requireCurrentUser(context);
        const pipeline = await Pipeline.findOne({ gitlabId }).lean();
        if (!pipeline) {
          throw new AppError(
            `Pipeline with GitLab ID ${gitlabId} not found. It may not be synced yet.`,
            404
          );
        }

        await requireProjectAccess(context, pipeline.projectId, 'gitlab');
        return pipeline;
      },

      pipelines: async (
        _: any,
        { projectId, status, ref, limit = 20, offset = 0 }: any,
        context: GraphQLContext
      ) => {
        requireCurrentUser(context);
        const filter: any = {};
        if (projectId) filter.projectId = projectId;
        if (status) filter.status = status;
        if (ref) filter.ref = ref;
        const scopedFilter = await withProjectFilter(context, filter, 'projectId', 'gitlab');

        return await Pipeline.find(scopedFilter)
          .limit(limit)
          .skip(offset)
          .sort({ createdAt: -1 })
          .lean();
      },

      pipelinesByProject: async (
        _: any,
        { projectId, status, limit = 20, offset = 0 }: { projectId: string; status?: string; limit: number; offset: number },
        context: GraphQLContext
      ) => {
        requireCurrentUser(context);
        const filter: any = { projectId };
        if (status) filter.status = status;
        const scopedFilter = await withProjectFilter(context, filter, 'projectId', 'gitlab');

        const [pipelines, totalCount] = await Promise.all([
          Pipeline.find(scopedFilter)
            .limit(limit)
            .skip(offset)
            .sort({ createdAt: -1 })
            .lean(),
          Pipeline.countDocuments(scopedFilter),
        ]);

        return {
          pipelines,
          totalCount,
        };
      },
    },
  },
});
