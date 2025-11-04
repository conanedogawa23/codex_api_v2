import { Job } from 'bull';
import { BaseSyncProcessor, SyncOptions, SyncResult } from '../base/baseSyncProcessor';
import { Commit, ICommit } from '../../../models/Commit';
import { logger } from '../../../utils/logger';
import { gitlabCommitProcessor } from './gitlabCommitProcessor';
import moment from 'moment-timezone';

class CommitSyncProcessor extends BaseSyncProcessor<ICommit> {
  readonly entityName = 'commit';
  readonly categories = ['coreData', 'diffStats', 'references', 'signatures'];

  async fetchFromGitLab(options: SyncOptions): Promise<any[]> {
    return [];
  }

  async fetchEntityData(ids: number[]): Promise<any> {
    return await gitlabCommitProcessor.fetchCommitData(ids);
  }

  async getExisting(gitlabId: number): Promise<any> {
    return await Commit.findOne({ gitlabId }).lean();
  }

  mapToModel(gitlabData: any): Partial<ICommit> {
    const syncTime = moment().toDate();
    if (!gitlabData || !gitlabData.commits || gitlabData.commits.length === 0) return {};

    const commit = gitlabData.commits[0];
    return {
      gitlabId: this.extractGitLabId(commit),
      sha: commit.sha || '',
      projectId: commit.project?.id ? String(this.extractGitLabId(commit.project)) : '',
      shortId: commit.shortId || '',
      title: commit.title || '',
      message: commit.message || '',
      authorName: commit.authorName || '',
      authorEmail: commit.authorEmail || '',
      authoredDate: commit.authoredDate ? new Date(commit.authoredDate) : syncTime,
      committerName: commit.committerName || '',
      committerEmail: commit.committerEmail || '',
      committedDate: commit.committedDate ? new Date(commit.committedDate) : syncTime,
      webUrl: commit.webUrl || '',
      parentIds: commit.parentIds || [],
      createdAt: syncTime,
      lastSyncedAt: syncTime,
      isDeleted: false,
      syncTimestamps: {}
    };
  }

  async updateModel(data: Partial<ICommit>): Promise<ICommit | null> {
    try {
      if (!data.gitlabId) return null;
      return await Commit.findOneAndUpdate(
        { gitlabId: data.gitlabId },
        { $set: data },
        { new: true, upsert: true, runValidators: true }
      );
    } catch (error: unknown) {
      logger.error('Error updating commit', { gitlabId: data.gitlabId, error: error instanceof Error ? error.message : 'Unknown error' });
      return null;
    }
  }

  protected isCategoryDataAvailable(gitlabData: any, category: string): boolean {
    if (!gitlabData || !gitlabData.commits || gitlabData.commits.length === 0) return false;
    const commit = gitlabData.commits[0];
    return !!(commit && commit.id);
  }
}

export const commitSyncProcessor = new CommitSyncProcessor();

export const processCommitSync = async (job: Job<SyncOptions>): Promise<SyncResult> => {
  try {
    return await commitSyncProcessor.sync(job);
  } catch (error: unknown) {
    logger.error('Commit sync failed', { jobId: job.id, error: error instanceof Error ? error.message : 'Unknown error' });
    throw error;
  }
};

