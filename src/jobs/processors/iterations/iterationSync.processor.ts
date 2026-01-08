import { Job } from 'bull';
import { BaseSyncProcessor, SyncOptions, SyncResult } from '../base/baseSyncProcessor';
import { Iteration, IIteration } from '../../../models/Iteration';
import { logger } from '../../../utils/logger';
import { gitlabIterationProcessor } from './gitlabIterationProcessor';
import moment from 'moment-timezone';

export interface IterationSyncJobData extends SyncOptions {
  groupPath?: string;
}

class IterationSyncProcessor extends BaseSyncProcessor<IIteration> {
  readonly entityName = 'iteration';
  readonly categories = ['coreData', 'issues'];

  async fetchFromGitLab(options: SyncOptions): Promise<any[]> {
    const groupPath = (options as IterationSyncJobData).groupPath;

    if (groupPath) {
      return await gitlabIterationProcessor.fetchSimpleIterations(options.batchSize || 100, groupPath);
    }

    // No groupPath - fetch iterations from all groups (namespaces)
    logger.info('Fetching iterations from all groups');
    const Namespace = require('../../../models/Namespace').Namespace;
    const groups = await Namespace.find({ kind: 'group' })
      .select('fullPath')
      .lean();

    logger.info('Found groups for iteration sync', { count: groups.length });

    const allIterations: any[] = [];
    for (const group of groups) {
      try {
        const iterations = await gitlabIterationProcessor.fetchSimpleIterations(
          options.batchSize || 100,
          group.fullPath
        );
        allIterations.push(...iterations);
      } catch (error) {
        logger.warn('Failed to fetch iterations for group', {
          groupPath: group.fullPath,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    logger.info('Fetched iterations from all groups', { totalIterations: allIterations.length });
    return allIterations;
  }

  async fetchEntityData(ids: number[], groupPath?: string): Promise<any> {
    return await gitlabIterationProcessor.fetchIterationData(ids, groupPath);
  }

  /**
   * Override processEntity to pass groupPath parameter
   */
  protected async processEntity(
    entity: any,
    categorySyncResults: { [category: string]: import('../base/baseSyncProcessor').CategorySyncResult }
  ): Promise<{ created: boolean; updated: boolean; skipped: boolean }> {
    const gitlabId = this.extractGitLabId(entity);
    const groupPath = entity.groupPath;

    if (!groupPath) {
      logger.error('Iteration entity missing groupPath', { gitlabId });
      return { created: false, updated: false, skipped: true };
    }

    const existingEntity = await this.getExisting(gitlabId);

    if (existingEntity) {
      if (this.shouldSkipSync(existingEntity)) {
        logger.debug(`Skipping ${this.entityName} sync`, {
          entityId: gitlabId,
          reason: 'Manual or non-syncable entity'
        });
        return { created: false, updated: false, skipped: true };
      }

      const detailedData = await this.fetchEntityData([gitlabId], groupPath);

      if (!detailedData || !detailedData.data) {
        logger.warn(`No detailed data found for ${this.entityName}`, { gitlabId, groupPath });
        return { created: false, updated: false, skipped: true };
      }

      const mappedData = this.mapToModel(detailedData.data);
      this.updateCategoryTimestamps(mappedData, detailedData.data, categorySyncResults);
      const savedEntity = await this.updateModel(mappedData);

      if (savedEntity) {
        logger.debug(`Updated ${this.entityName}`, { gitlabId, groupPath });
        return { created: false, updated: true, skipped: false };
      }

      logger.warn(`Failed to update ${this.entityName}`, { gitlabId, groupPath });
      return { created: false, updated: false, skipped: true };
    }

    const detailedData = await this.fetchEntityData([gitlabId], groupPath);

    if (!detailedData || !detailedData.data) {
      logger.warn(`No detailed data found for new ${this.entityName}`, { gitlabId, groupPath });
      return { created: false, updated: false, skipped: true };
    }

    const mappedData = this.mapToModel(detailedData.data);
    this.updateCategoryTimestamps(mappedData, detailedData.data, categorySyncResults);
    const savedEntity = await this.updateModel(mappedData);

    if (savedEntity) {
      logger.debug(`Created ${this.entityName}`, { gitlabId, groupPath });
      return { created: true, updated: false, skipped: false };
    }

    logger.warn(`Failed to create ${this.entityName}`, { gitlabId, groupPath });
    return { created: false, updated: false, skipped: true };
  }

  async getExisting(gitlabId: number): Promise<any> {
    return await Iteration.findOne({ gitlabId }).lean();
  }

  mapToModel(gitlabData: any): Partial<IIteration> {
    const syncTime = moment().toDate();
    if (!gitlabData || !gitlabData.iterations || gitlabData.iterations.length === 0) return {};

    const iteration = gitlabData.iterations[0];
    return {
      gitlabId: this.extractGitLabId(iteration),
      iid: iteration.iid || 0,
      title: iteration.title || '',
      description: iteration.description || '',
      state: iteration.state === 'closed' ? 'closed' : 'opened',
      startDate: iteration.startDate ? new Date(iteration.startDate) : undefined,
      dueDate: iteration.dueDate ? new Date(iteration.dueDate) : undefined,
      createdAt: iteration.createdAt ? new Date(iteration.createdAt) : syncTime,
      updatedAt: iteration.updatedAt ? new Date(iteration.updatedAt) : syncTime,
      lastSyncedAt: syncTime,
      isDeleted: false,
      syncTimestamps: {}
    };
  }

  async updateModel(data: Partial<IIteration>): Promise<IIteration | null> {
    try {
      if (!data.gitlabId) return null;
      return await Iteration.findOneAndUpdate(
        { gitlabId: data.gitlabId },
        { $set: data },
        { new: true, upsert: true, runValidators: true }
      );
    } catch (error: unknown) {
      logger.error('Error updating iteration', { gitlabId: data.gitlabId, error: error instanceof Error ? error.message : 'Unknown error' });
      return null;
    }
  }

  protected isCategoryDataAvailable(gitlabData: any, category: string): boolean {
    if (!gitlabData || !gitlabData.iterations || gitlabData.iterations.length === 0) return false;
    const iteration = gitlabData.iterations[0];
    switch (category) {
      case 'coreData': return !!(iteration.id && iteration.title);
      case 'issues': return iteration.issues !== undefined;
      default: return super.isCategoryDataAvailable(gitlabData, category);
    }
  }
}

export const iterationSyncProcessor = new IterationSyncProcessor();

export const processIterationSync = async (job: Job<IterationSyncJobData>): Promise<SyncResult> => {
  try {
    return await iterationSyncProcessor.sync(job);
  } catch (error: unknown) {
    logger.error('Iteration sync failed', { jobId: job.id, error: error instanceof Error ? error.message : 'Unknown error' });
    throw error;
  }
};

