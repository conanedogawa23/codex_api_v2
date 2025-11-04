import { Job } from 'bull';
import { BaseSyncProcessor, SyncOptions, SyncResult } from '../base/baseSyncProcessor';
import { Discussion, IDiscussion } from '../../../models/Discussion';
import { logger } from '../../../utils/logger';
import { gitlabDiscussionProcessor } from './gitlabDiscussionProcessor';
import moment from 'moment-timezone';

class DiscussionSyncProcessor extends BaseSyncProcessor<IDiscussion> {
  readonly entityName = 'discussion';
  readonly categories = ['coreData', 'notes'];

  async fetchFromGitLab(options: SyncOptions): Promise<any[]> {
    return [];
  }

  async fetchEntityData(ids: number[]): Promise<any> {
    return await gitlabDiscussionProcessor.fetchDiscussionData(ids);
  }

  async getExisting(gitlabId: number): Promise<any> {
    return await Discussion.findOne({ gitlabId: String(gitlabId) }).lean();
  }

  mapToModel(gitlabData: any): Partial<IDiscussion> {
    const syncTime = moment().toDate();
    if (!gitlabData || !gitlabData.discussions || gitlabData.discussions.length === 0) return {};

    const discussion = gitlabData.discussions[0];
    return {
      gitlabId: String(this.extractGitLabId(discussion)),
      projectId: discussion.project?.id ? String(this.extractGitLabId(discussion.project)) : '',
      noteableType: discussion.noteableType || 'Issue',
      individualNote: discussion.individualNote || false,
      resolved: discussion.resolved || false,
      resolvable: discussion.resolvable || false,
      noteIds: [],
      createdAt: discussion.createdAt ? new Date(discussion.createdAt) : syncTime,
      updatedAt: discussion.updatedAt ? new Date(discussion.updatedAt) : syncTime,
      resolvedAt: discussion.resolvedAt ? new Date(discussion.resolvedAt) : undefined,
      lastSyncedAt: syncTime,
      isDeleted: false,
      syncTimestamps: {}
    };
  }

  async updateModel(data: Partial<IDiscussion>): Promise<IDiscussion | null> {
    try {
      if (!data.gitlabId) return null;
      return await Discussion.findOneAndUpdate(
        { gitlabId: data.gitlabId },
        { $set: data },
        { new: true, upsert: true, runValidators: true }
      );
    } catch (error: unknown) {
      logger.error('Error updating discussion', { gitlabId: data.gitlabId, error: error instanceof Error ? error.message : 'Unknown error' });
      return null;
    }
  }

  protected isCategoryDataAvailable(gitlabData: any, category: string): boolean {
    if (!gitlabData || !gitlabData.discussions || gitlabData.discussions.length === 0) return false;
    return true;
  }
}

export const discussionSyncProcessor = new DiscussionSyncProcessor();

export const processDiscussionSync = async (job: Job<SyncOptions>): Promise<SyncResult> => {
  try {
    return await discussionSyncProcessor.sync(job);
  } catch (error: unknown) {
    logger.error('Discussion sync failed', { jobId: job.id, error: error instanceof Error ? error.message : 'Unknown error' });
    throw error;
  }
};

