import { Job } from 'bull';
import { BaseSyncProcessor, SyncOptions, SyncResult } from '../base/baseSyncProcessor';
import { Pipeline, IPipeline } from '../../../models/Pipeline';
import { logger } from '../../../utils/logger';
import { gitlabPipelineProcessor } from './gitlabPipelineProcessor';
import moment from 'moment-timezone';

export interface PipelineSyncJobData extends SyncOptions {
  projectPath?: string;
}

class PipelineSyncProcessor extends BaseSyncProcessor<IPipeline> {
  readonly entityName = 'pipeline';
  readonly categories = ['coreData', 'jobs', 'testReports', 'variables', 'artifacts'];

  async fetchFromGitLab(options: SyncOptions): Promise<any[]> {
    const projectPath = (options as PipelineSyncJobData).projectPath;
    return await gitlabPipelineProcessor.fetchSimplePipelines(options.batchSize || 100, projectPath);
  }

  async fetchEntityData(ids: number[]): Promise<any> {
    return await gitlabPipelineProcessor.fetchPipelineData(ids);
  }

  async getExisting(gitlabId: number): Promise<any> {
    return await Pipeline.findOne({ gitlabId }).lean();
  }

  mapToModel(gitlabData: any): Partial<IPipeline> {
    const syncTime = moment().toDate();
    if (!gitlabData || !gitlabData.pipelines || gitlabData.pipelines.length === 0) {
      return {};
    }

    const pipeline = gitlabData.pipelines[0];
    const gitlabId = this.extractGitLabId(pipeline);

    return {
      gitlabId,
      projectId: pipeline.project?.id ? String(this.extractNumericId(pipeline.project.id)) : '',
      ref: pipeline.ref || '',
      sha: pipeline.sha || '',
      status: pipeline.status || 'pending',
      source: pipeline.source || '',
      beforeSha: pipeline.beforeSha || undefined,
      tag: pipeline.tag || false,
      webUrl: pipeline.webUrl || '',
      duration: pipeline.duration || undefined,
      queuedDuration: pipeline.queuedDuration || undefined,
      coverage: pipeline.coverage || undefined,
      jobIds: [],
      createdAt: pipeline.createdAt ? new Date(pipeline.createdAt) : syncTime,
      updatedAt: pipeline.updatedAt ? new Date(pipeline.updatedAt) : syncTime,
      startedAt: pipeline.startedAt ? new Date(pipeline.startedAt) : undefined,
      finishedAt: pipeline.finishedAt ? new Date(pipeline.finishedAt) : undefined,
      committedAt: pipeline.committedAt ? new Date(pipeline.committedAt) : undefined,
      lastSyncedAt: syncTime,
      isDeleted: false,
      syncTimestamps: {}
    };
  }

  async updateModel(data: Partial<IPipeline>): Promise<IPipeline | null> {
    try {
      if (!data.gitlabId) return null;
      return await Pipeline.findOneAndUpdate(
        { gitlabId: data.gitlabId },
        { $set: data },
        { new: true, upsert: true, runValidators: true }
      );
    } catch (error: unknown) {
      logger.error('Error updating pipeline model', {
        gitlabId: data.gitlabId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }

  protected shouldSkipSync(existingEntity: any): boolean {
    if (existingEntity.status === 'success' || existingEntity.status === 'failed') {
      const oneMonthAgo = moment().subtract(1, 'month');
      if (existingEntity.finishedAt && moment(existingEntity.finishedAt).isBefore(oneMonthAgo)) {
        return true;
      }
    }
    return false;
  }

  protected isCategoryDataAvailable(gitlabData: any, category: string): boolean {
    if (!gitlabData || !gitlabData.pipelines || gitlabData.pipelines.length === 0) {
      return false;
    }
    const pipeline = gitlabData.pipelines[0];
    switch (category) {
      case 'coreData':
        return !!(pipeline.id && pipeline.status);
      case 'jobs':
        return !!(pipeline.jobs !== undefined);
      case 'testReports':
        return !!(pipeline.testReportSummary !== undefined);
      case 'variables':
        return !!(pipeline.variables !== undefined);
      case 'artifacts':
        return !!(pipeline.artifacts !== undefined);
      default:
        return super.isCategoryDataAvailable(gitlabData, category);
    }
  }

  private extractNumericId(globalId: string): number {
    if (typeof globalId === 'number') return globalId;
    const match = globalId.match(/\d+$/);
    return match ? parseInt(match[0]) : 0;
  }
}

export const pipelineSyncProcessor = new PipelineSyncProcessor();

export const processPipelineSync = async (job: Job<PipelineSyncJobData>): Promise<SyncResult> => {
  logger.info('Starting pipeline sync job', { jobId: job.id });
  try {
    const result = await pipelineSyncProcessor.sync(job);
    logger.info('Pipeline sync job completed', { jobId: job.id, result });
    return result;
  } catch (error: unknown) {
    logger.error('Pipeline sync job failed', {
      jobId: job.id,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
};

