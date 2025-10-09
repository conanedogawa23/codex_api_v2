import { createModule, gql } from 'graphql-modules';
import { PipelineJob } from '../../../models/PipelineJob';
import { AppError } from '../../../middleware';
import { logger } from '../../../utils/logger';

export const pipelineJobModule = createModule({
  id: 'pipelineJob',
  typeDefs: gql`
    type PipelineJob {
      id: ID!
      gitlabId: Int!
      pipelineId: ID!
      projectId: String!
      name: String!
      stage: String!
      status: PipelineJobStatus!
      ref: String!
      tag: Boolean!
      coverage: Float
      allowFailure: Boolean!
      duration: Float
      queuedDuration: Float
      webUrl: String!
      userId: ID
      runnerId: Int
      runnerDescription: String
      createdAt: DateTime!
      startedAt: DateTime
      finishedAt: DateTime
      erasedAt: DateTime
      artifactsExpireAt: DateTime
      lastSyncedAt: DateTime!
      isDeleted: Boolean!
    }

    enum PipelineJobStatus {
      created
      pending
      running
      success
      failed
      canceled
      skipped
      manual
      waiting_for_resource
      preparing
    }

    extend type Query {
      pipelineJob(id: ID!): PipelineJob
      pipelineJobByGitlabId(gitlabId: Int!): PipelineJob
      pipelineJobs(pipelineId: ID!, limit: Int = 20, offset: Int = 0): [PipelineJob!]!
      pipelineJobsByStage(pipelineId: ID!, stage: String!, limit: Int = 20): [PipelineJob!]!
      pipelineJobsByStatus(projectId: String!, status: PipelineJobStatus!, limit: Int = 20, offset: Int = 0): [PipelineJob!]!
      failedPipelineJobs(projectId: String!, limit: Int = 20): [PipelineJob!]!
    }
  `,
  resolvers: {
    Query: {
      pipelineJob: async (_: any, { id }: { id: string }) => {
        logger.info('Fetching pipeline job by ID', { id });
        
        const job = await PipelineJob.findById(id).lean();
        
        if (!job) {
          throw new AppError(`Pipeline job with ID ${id} not found`, 404);
        }
        
        return job;
      },

      pipelineJobByGitlabId: async (_: any, { gitlabId }: { gitlabId: number }) => {
        logger.info('Fetching pipeline job by GitLab ID', { gitlabId });
        
        const job = await PipelineJob.findOne({ gitlabId, isDeleted: false }).lean();
        
        if (!job) {
          throw new AppError(
            `Pipeline job with GitLab ID ${gitlabId} not found. It may not be synced yet.`,
            404
          );
        }
        
        return job;
      },

      pipelineJobs: async (_: any, { pipelineId, limit, offset }: { pipelineId: string; limit: number; offset: number }) => {
        logger.info('Fetching pipeline jobs', { pipelineId, limit, offset });
        
        return await PipelineJob.find({ pipelineId, isDeleted: false })
          .limit(limit)
          .skip(offset)
          .sort({ createdAt: -1 })
          .lean();
      },

      pipelineJobsByStage: async (_: any, { pipelineId, stage, limit }: { pipelineId: string; stage: string; limit: number }) => {
        logger.info('Fetching pipeline jobs by stage', { pipelineId, stage, limit });
        
        return await PipelineJob.find({ pipelineId, stage, isDeleted: false })
          .limit(limit)
          .sort({ createdAt: 1 })
          .lean();
      },

      pipelineJobsByStatus: async (_: any, { projectId, status, limit, offset }: { projectId: string; status: string; limit: number; offset: number }) => {
        logger.info('Fetching pipeline jobs by status', { projectId, status, limit, offset });
        
        return await PipelineJob.find({ projectId, status, isDeleted: false })
          .limit(limit)
          .skip(offset)
          .sort({ createdAt: -1 })
          .lean();
      },

      failedPipelineJobs: async (_: any, { projectId, limit }: { projectId: string; limit: number }) => {
        logger.info('Fetching failed pipeline jobs', { projectId, limit });
        
        return await PipelineJob.find({ projectId, status: 'failed', isDeleted: false })
          .limit(limit)
          .sort({ createdAt: -1 })
          .lean();
      },
    },
  },
});
