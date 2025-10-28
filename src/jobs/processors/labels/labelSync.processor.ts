import { Job } from 'bull';
import { BaseSyncProcessor, SyncOptions, SyncResult } from '../base/baseSyncProcessor';
import { Label, ILabel } from '../../../models/Label';
import { logger } from '../../../utils/logger';
import { gitlabLabelProcessor } from './gitlabLabelProcessor';
import moment from 'moment-timezone';

export interface LabelSyncJobData extends SyncOptions {
  projectPath?: string;
}

class LabelSyncProcessor extends BaseSyncProcessor<ILabel> {
  readonly entityName = 'label';
  readonly categories = ['coreData', 'usageStats', 'relatedIssues'];

  async fetchFromGitLab(options: SyncOptions): Promise<any[]> {
    const projectPath = (options as LabelSyncJobData).projectPath;
    return await gitlabLabelProcessor.fetchSimpleLabels(options.batchSize || 200, projectPath);
  }

  async fetchEntityData(ids: number[]): Promise<any> {
    return await gitlabLabelProcessor.fetchLabelData(ids);
  }

  async getExisting(gitlabId: number): Promise<any> {
    return await Label.findOne({ gitlabId }).lean();
  }

  mapToModel(gitlabData: any): Partial<ILabel> {
    const syncTime = moment().toDate();
    if (!gitlabData || !gitlabData.labels || gitlabData.labels.length === 0) return {};

    const label = gitlabData.labels[0];
    return {
      gitlabId: this.extractGitLabId(label),
      title: label.title || '',
      description: label.description || '',
      color: label.color || '#000000',
      textColor: label.textColor || '#FFFFFF',
      createdAt: label.createdAt ? new Date(label.createdAt) : syncTime,
      updatedAt: label.updatedAt ? new Date(label.updatedAt) : syncTime,
      lastSyncedAt: syncTime,
      isDeleted: false,
      syncTimestamps: {}
    };
  }

  async updateModel(data: Partial<ILabel>): Promise<ILabel | null> {
    try {
      if (!data.gitlabId) return null;
      return await Label.findOneAndUpdate(
        { gitlabId: data.gitlabId },
        { $set: data },
        { new: true, upsert: true, runValidators: true }
      );
    } catch (error: unknown) {
      logger.error('Error updating label', { gitlabId: data.gitlabId, error: error instanceof Error ? error.message : 'Unknown error' });
      return null;
    }
  }

  protected isCategoryDataAvailable(gitlabData: any, category: string): boolean {
    if (!gitlabData || !gitlabData.labels || gitlabData.labels.length === 0) return false;
    const label = gitlabData.labels[0];
    return !!(label && label.id);
  }
}

export const labelSyncProcessor = new LabelSyncProcessor();

export const processLabelSync = async (job: Job<LabelSyncJobData>): Promise<SyncResult> => {
  try {
    return await labelSyncProcessor.sync(job);
  } catch (error: unknown) {
    logger.error('Label sync failed', { jobId: job.id, error: error instanceof Error ? error.message : 'Unknown error' });
    throw error;
  }
};

