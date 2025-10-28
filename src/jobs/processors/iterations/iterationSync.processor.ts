import { Job } from 'bull';
import { BaseSyncProcessor, SyncOptions, SyncResult } from '../base/baseSyncProcessor';
import { Iteration, IIteration } from '../../../models/Iteration';
import { logger } from '../../../utils/logger';
import { gitlabIterationProcessor } from './gitlabIterationProcessor';
import moment from 'moment-timezone';

class IterationSyncProcessor extends BaseSyncProcessor<IIteration> {
  readonly entityName = 'iteration';
  readonly categories = ['coreData', 'issues'];

  async fetchFromGitLab(options: SyncOptions): Promise<any[]> {
    return await gitlabIterationProcessor.fetchSimpleIterations(options.batchSize || 100);
  }

  async fetchEntityData(ids: number[]): Promise<any> {
    return await gitlabIterationProcessor.fetchIterationData(ids);
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

export const processIterationSync = async (job: Job<SyncOptions>): Promise<SyncResult> => {
  try {
    return await iterationSyncProcessor.sync(job);
  } catch (error: unknown) {
    logger.error('Iteration sync failed', { jobId: job.id, error: error instanceof Error ? error.message : 'Unknown error' });
    throw error;
  }
};

