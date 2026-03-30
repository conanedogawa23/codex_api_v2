import { createModule, gql } from 'graphql-modules';
import { Pipeline } from '../../../models/Pipeline';
import { AppError } from '../../../middleware';
import { GraphQLContext, requireCurrentUser } from '../../../utils/auth';
import { logger } from '../../../utils/logger';
import { requireProjectAccess, withProjectFilter } from '../../../utils/rbac';
import { gitlabApi, type GitLabPipelineResponse } from '../../../utils/gitlabApi';

const PIPELINE_STATUS_FALLBACK = 'pending';

const normalizePipelineStatus = (raw: string | undefined): string => {
  if (!raw) return PIPELINE_STATUS_FALLBACK;
  const s = raw.toLowerCase();
  const allowed = new Set([
    'created',
    'waiting_for_resource',
    'preparing',
    'pending',
    'running',
    'success',
    'failed',
    'canceled',
    'skipped',
    'manual',
    'scheduled',
  ]);
  return allowed.has(s) ? s : PIPELINE_STATUS_FALLBACK;
};

const mapGitLabPipelineToPipeline = (row: GitLabPipelineResponse, projectId: string) => {
  const now = new Date();
  return {
    id: `live-pl-${row.id}`,
    gitlabId: row.id,
    projectId,
    ref: row.ref ?? '',
    sha: row.sha ?? '',
    status: normalizePipelineStatus(row.status),
    source: row.source ?? '',
    beforeSha: row.before_sha ?? undefined,
    tag: Boolean(row.tag),
    webUrl: row.web_url ?? '',
    duration: row.duration ?? undefined,
    queuedDuration: row.queued_duration ?? undefined,
    coverage: row.coverage ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    startedAt: row.started_at ? new Date(row.started_at) : undefined,
    finishedAt: row.finished_at ? new Date(row.finished_at) : undefined,
    committedAt: row.committed_at ? new Date(row.committed_at) : undefined,
    lastSyncedAt: now,
    isDeleted: false,
  };
};

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

    enum PipelineSource {
      DATABASE
      LIVE
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
      pipelinesByProject(
        projectId: String!
        status: PipelineStatus
        limit: Int = 20
        offset: Int = 0
        source: PipelineSource = DATABASE
      ): PipelinesByProjectResult!
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
        {
          projectId,
          status,
          limit = 20,
          offset = 0,
          source = 'DATABASE',
        }: { projectId: string; status?: string; limit: number; offset: number; source?: 'DATABASE' | 'LIVE' },
        context: GraphQLContext
      ) => {
        requireCurrentUser(context);
        logger.info('pipelinesByProject', { projectId, status, limit, offset, source });

        if (source === 'LIVE') {
          await requireProjectAccess(context, projectId, 'gitlab');
          if (limit <= 0) {
            return { pipelines: [], totalCount: 0 };
          }
          const perPage = Math.min(limit, 100);
          const page = Math.floor(offset / perPage) + 1;
          const withinPageStart = offset - (page - 1) * perPage;
          const statusParam = status ? String(status).toLowerCase() : undefined;
          const { pipelines: rows, total } = await gitlabApi.listProjectPipelinesPage(
            projectId,
            page,
            perPage,
            statusParam
          );
          const sliced = rows.slice(withinPageStart, withinPageStart + limit);
          return {
            pipelines: sliced.map((row) => mapGitLabPipelineToPipeline(row, projectId)),
            totalCount: total ?? 0,
          };
        }

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
