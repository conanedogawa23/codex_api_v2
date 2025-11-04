import { Job } from 'bull';
import { BaseSyncProcessor, SyncOptions, SyncResult } from '../base/baseSyncProcessor';
import { Milestone, IMilestone } from '../../../models/Milestone';
import { logger } from '../../../utils/logger';
import { gitlabMilestoneProcessor } from './gitlabMilestoneProcessor';
import moment from 'moment-timezone';

export interface MilestoneSyncJobData extends SyncOptions {
  projectPath?: string;
}

class MilestoneSyncProcessor extends BaseSyncProcessor<IMilestone> {
  readonly entityName = 'milestone';
  readonly categories = ['coreData', 'issues', 'mergeRequests', 'statistics'];

  async fetchFromGitLab(options: SyncOptions): Promise<any[]> {
    const projectPath = (options as MilestoneSyncJobData).projectPath;
    return await gitlabMilestoneProcessor.fetchSimpleMilestones(options.batchSize || 100, projectPath);
  }

  async fetchEntityData(ids: number[]): Promise<any> {
    return await gitlabMilestoneProcessor.fetchMilestoneData(ids);
  }

  async getExisting(gitlabId: number): Promise<any> {
    return await Milestone.findOne({ gitlabId }).lean();
  }

  mapToModel(gitlabData: any): Partial<IMilestone> {
    const syncTime = moment().toDate();
    if (!gitlabData || !gitlabData.milestones || gitlabData.milestones.length === 0) return {};

    const ms = gitlabData.milestones[0];
    return {
      gitlabId: this.extractGitLabId(ms),
      projectId: ms.project?.id ? String(this.extractNumericId(ms.project.id)) : '',
      iid: ms.iid || 0,
      title: ms.title || '',
      description: ms.description || '',
      state: ms.state === 'closed' ? 'closed' : 'active',
      dueDate: ms.dueDate ? new Date(ms.dueDate) : undefined,
      startDate: ms.startDate ? new Date(ms.startDate) : undefined,
      webUrl: ms.webUrl || '',
      issueIds: [],
      mergeRequestIds: [],
      createdAt: ms.createdAt ? new Date(ms.createdAt) : syncTime,
      updatedAt: ms.updatedAt ? new Date(ms.updatedAt) : syncTime,
      lastSyncedAt: syncTime,
      isDeleted: false,
      syncTimestamps: {}
    };
  }

  async updateModel(data: Partial<IMilestone>): Promise<IMilestone | null> {
    try {
      if (!data.gitlabId) return null;
      return await Milestone.findOneAndUpdate(
        { gitlabId: data.gitlabId },
        { $set: data },
        { new: true, upsert: true, runValidators: true }
      );
    } catch (error: unknown) {
      logger.error('Error updating milestone', { gitlabId: data.gitlabId, error: error instanceof Error ? error.message : 'Unknown error' });
      return null;
    }
  }

  protected isCategoryDataAvailable(gitlabData: any, category: string): boolean {
    if (!gitlabData || !gitlabData.milestones || gitlabData.milestones.length === 0) return false;
    const ms = gitlabData.milestones[0];
    switch (category) {
      case 'coreData': return !!(ms.id && ms.title);
      case 'issues': return ms.issues !== undefined;
      case 'mergeRequests': return ms.mergeRequests !== undefined;
      case 'statistics': return ms.stats !== undefined;
      default: return super.isCategoryDataAvailable(gitlabData, category);
    }
  }

  private extractNumericId(globalId: string): number {
    if (typeof globalId === 'number') return globalId;
    const match = globalId.match(/\d+$/);
    return match ? parseInt(match[0]) : 0;
  }
}

export const milestoneSyncProcessor = new MilestoneSyncProcessor();

export const processMilestoneSync = async (job: Job<MilestoneSyncJobData>): Promise<SyncResult> => {
  try {
    return await milestoneSyncProcessor.sync(job);
  } catch (error: unknown) {
    logger.error('Milestone sync failed', { jobId: job.id, error: error instanceof Error ? error.message : 'Unknown error' });
    throw error;
  }
};

