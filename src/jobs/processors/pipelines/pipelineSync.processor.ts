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

    if (projectPath) {
      return await gitlabPipelineProcessor.fetchSimplePipelines(options.batchSize || 100, projectPath);
    }

    // No projectPath - fetch pipelines from all active projects
    logger.info('Fetching pipelines from all active projects');
    const Project = require('../../../models/Project').Project;
    const projects = await Project.find({ isActive: true })
      .select('pathWithNamespace')
      .lean();

    logger.info('Found active projects for pipeline sync', { count: projects.length });

    const allPipelines: any[] = [];
    for (const project of projects) {
      try {
        const pipelines = await gitlabPipelineProcessor.fetchSimplePipelines(
          options.batchSize || 100,
          project.pathWithNamespace
        );
        allPipelines.push(...pipelines);
      } catch (error) {
        logger.warn('Failed to fetch pipelines for project', {
          projectPath: project.pathWithNamespace,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    logger.info('Fetched pipelines from all projects', { totalPipelines: allPipelines.length });
    return allPipelines;
  }

  async fetchEntityData(ids: number[], projectPath?: string, iid?: number): Promise<any> {
    return await gitlabPipelineProcessor.fetchPipelineData(ids, projectPath, iid);
  }

  /**
   * Override processEntity to pass projectPath and iid parameters
   */
  protected async processEntity(
    entity: any,
    categorySyncResults: { [category: string]: import('../base/baseSyncProcessor').CategorySyncResult }
  ): Promise<{ created: boolean; updated: boolean; skipped: boolean }> {
    const gitlabId = this.extractGitLabId(entity);
    const projectPath = entity.projectPath;
    const iid = entity.iid;

    if (!projectPath || !iid) {
      logger.error('Pipeline entity missing projectPath or iid', { gitlabId });
      return { created: false, updated: false, skipped: true };
    }

    // Check if entity exists
    const existingEntity = await this.getExisting(gitlabId);

    if (existingEntity) {
      // Check if entity should be skipped
      if (this.shouldSkipSync(existingEntity)) {
        logger.debug(`Skipping ${this.entityName} sync`, {
          entityId: gitlabId,
          reason: 'Manual or non-syncable entity'
        });
        return { created: false, updated: false, skipped: true };
      }

      // Fetch detailed data with all categories, passing projectPath and iid
      const detailedData = await this.fetchEntityData([gitlabId], projectPath, iid);

      if (!detailedData || !detailedData.data) {
        logger.warn(`No detailed data found for ${this.entityName}`, { gitlabId, projectPath, iid });
        return { created: false, updated: false, skipped: true };
      }

      // Map GitLab data to model
      const mappedData = this.mapToModel(detailedData.data);

      // Update category sync timestamps
      this.updateCategoryTimestamps(mappedData, detailedData.data, categorySyncResults);

      // Update in database
      const savedEntity = await this.updateModel(mappedData);

      if (savedEntity) {
        logger.debug(`Updated ${this.entityName}`, { gitlabId, projectPath, iid });
        return { created: false, updated: true, skipped: false };
      }

      logger.warn(`Failed to update ${this.entityName}`, { gitlabId, projectPath, iid });
      return { created: false, updated: false, skipped: true };
    }

    // New entity - fetch detailed data and create, passing projectPath and iid
    const detailedData = await this.fetchEntityData([gitlabId], projectPath, iid);

    if (!detailedData || !detailedData.data) {
      logger.warn(`No detailed data found for new ${this.entityName}`, { gitlabId, projectPath, iid });
      return { created: false, updated: false, skipped: true };
    }

    // Map GitLab data to model
    const mappedData = this.mapToModel(detailedData.data);

    // Update category sync timestamps
    this.updateCategoryTimestamps(mappedData, detailedData.data, categorySyncResults);

    // Create in database
    const savedEntity = await this.updateModel(mappedData);

    if (savedEntity) {
      logger.debug(`Created ${this.entityName}`, { gitlabId, projectPath, iid });
      return { created: true, updated: false, skipped: false };
    }

    logger.warn(`Failed to create ${this.entityName}`, { gitlabId, projectPath, iid });
    return { created: false, updated: false, skipped: true };
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

