import { Job } from 'bull';
import { BaseSyncProcessor, SyncOptions, SyncResult } from '../base/baseSyncProcessor';
import { Commit, ICommit } from '../../../models/Commit';
import { User } from '../../../models/User';
import { logger } from '../../../utils/logger';
import { gitlabCommitProcessor } from './gitlabCommitProcessor';
import moment from 'moment-timezone';
import { fetchAcrossActiveProjects, ProjectScopedSyncOptions } from '../shared/projectSyncTargets';

export interface CommitSyncJobData extends ProjectScopedSyncOptions {
  projectPath?: string;
}

class CommitSyncProcessor extends BaseSyncProcessor<ICommit> {
  readonly entityName = 'commit';
  readonly categories = ['coreData', 'diffStats'];
  private readonly userIdByEmail = new Map<string, string | null>();

  private async resolveCommitUserId(authorEmail?: string, committerEmail?: string) {
    const candidates = [authorEmail, committerEmail]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .map((value) => value.trim().toLowerCase());

    if (candidates.length === 0) {
      return undefined;
    }

    for (const email of candidates) {
      if (this.userIdByEmail.has(email)) {
        const cachedUserId = this.userIdByEmail.get(email);
        return cachedUserId || undefined;
      }
    }

    const matchedUser = await User.findOne({ email: { $in: candidates } })
      .select('_id email')
      .lean();

    const matchedEmail = typeof matchedUser?.email === 'string'
      ? matchedUser.email.trim().toLowerCase()
      : undefined;
    const matchedUserId = matchedUser?._id?.toString() || null;

    for (const email of candidates) {
      this.userIdByEmail.set(email, matchedUserId && email === matchedEmail ? matchedUserId : null);
    }

    return matchedUserId || undefined;
  }

  async fetchFromGitLab(options: SyncOptions): Promise<any[]> {
    const projectPath = (options as CommitSyncJobData).projectPath;

    if (projectPath) {
      return await gitlabCommitProcessor.fetchSimpleCommits(options.batchSize || 100, projectPath);
    }

    logger.info('Fetching commits from all active projects');
    const allCommits = await fetchAcrossActiveProjects(
      'commits',
      options as CommitSyncJobData,
      async (project) => gitlabCommitProcessor.fetchSimpleCommits(
        options.batchSize || 100,
        project.pathWithNamespace,
        project.gitlabId
      )
    );

    logger.info('Fetched commits from all projects', {
      totalCommits: allCommits.length,
      projectOffset: (options as CommitSyncJobData).projectOffset || 0,
      projectLimit: (options as CommitSyncJobData).projectLimit || 'all'
    });
    return allCommits;
  }

  async fetchEntityData(ids: number[], projectPath?: string, sha?: string): Promise<any> {
    return await gitlabCommitProcessor.fetchCommitData(ids, projectPath, sha);
  }

  /**
   * Override processEntity to pass projectPath and sha parameters
   */
  protected async processEntity(
    entity: any,
    categorySyncResults: { [category: string]: import('../base/baseSyncProcessor').CategorySyncResult }
  ): Promise<{ created: boolean; updated: boolean; skipped: boolean }> {
    const projectPath = entity.projectPath;
    const sha = entity.sha;
    const projectId = String(entity.projectId || '');

    if (!projectPath || !sha || !projectId) {
      logger.error('Commit entity missing projectPath, projectId, or sha', {
        projectPath,
        projectId,
        sha,
      });
      return { created: false, updated: false, skipped: true };
    }

    const existingEntity = await Commit.findOne({ sha, projectId }).lean();

    if (existingEntity) {
      if (this.shouldSkipSync(existingEntity)) {
        logger.debug(`Skipping ${this.entityName} sync`, {
          entityId: sha,
          reason: 'Manual or non-syncable entity'
        });
        return { created: false, updated: false, skipped: true };
      }
    }

    const wrappedData = { commits: [entity] };
    const mappedData = this.mapToModel(wrappedData);
    const matchedUserId = await this.resolveCommitUserId(mappedData.authorEmail, mappedData.committerEmail);
    if (matchedUserId) {
      mappedData.userId = matchedUserId as any;
    }
    this.updateCategoryTimestamps(mappedData, wrappedData, categorySyncResults);
    const savedEntity = await this.updateModel(mappedData);

    if (savedEntity) {
      logger.debug(`${existingEntity ? 'Updated' : 'Created'} ${this.entityName}`, {
        projectId,
        projectPath,
        sha,
      });
      return {
        created: !existingEntity,
        updated: !!existingEntity,
        skipped: false,
      };
    }

    logger.warn(`Failed to save ${this.entityName}`, { projectId, projectPath, sha });
    return { created: false, updated: false, skipped: true };
  }

  async getExisting(gitlabId: number): Promise<any> {
    return await Commit.findOne({ gitlabId }).lean();
  }

  mapToModel(gitlabData: any): Partial<ICommit> {
    const syncTime = moment().toDate();
    if (!gitlabData || !gitlabData.commits || gitlabData.commits.length === 0) return {};

    const commit = gitlabData.commits[0];
    return {
      sha: commit.sha || commit.id || '',
      projectId: commit.projectId
        ? String(commit.projectId)
        : commit.project?.id
          ? String(this.extractGitLabId(commit.project))
          : '',
      shortId: commit.shortId || commit.short_id || '',
      title: commit.title || '',
      message: commit.message || '',
      authorName: commit.authorName || commit.author_name || commit.author?.name || '',
      authorEmail: commit.authorEmail || commit.author_email || '',
      authoredDate: commit.authoredDate || commit.authored_date
        ? new Date(commit.authoredDate || commit.authored_date)
        : syncTime,
      committerName: commit.committerName || commit.committer_name || commit.committer?.name || '',
      committerEmail: commit.committerEmail || commit.committer_email || '',
      committedDate: commit.committedDate || commit.committed_date
        ? new Date(commit.committedDate || commit.committed_date)
        : syncTime,
      webUrl: commit.webUrl || commit.web_url || '',
      parentIds: commit.parentIds || commit.parent_ids || [],
      stats: commit.stats
        ? {
            additions: commit.stats.additions || 0,
            deletions: commit.stats.deletions || 0,
            total: commit.stats.total || 0,
          }
        : undefined,
      lastSyncedAt: syncTime,
      isDeleted: false,
      syncTimestamps: {}
    };
  }

  async updateModel(data: Partial<ICommit>): Promise<ICommit | null> {
    try {
      if (!data.sha || !data.projectId) return null;
      return await Commit.findOneAndUpdate(
        { sha: data.sha, projectId: data.projectId },
        { $set: data },
        { new: true, upsert: true, runValidators: true }
      );
    } catch (error: unknown) {
      logger.error('Error updating commit', {
        sha: data.sha,
        projectId: data.projectId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }

  protected isCategoryDataAvailable(gitlabData: any, category: string): boolean {
    if (!gitlabData || !gitlabData.commits || gitlabData.commits.length === 0) return false;
    const commit = gitlabData.commits[0];
    switch (category) {
      case 'coreData':
        return !!(commit && (commit.sha || commit.id) && (commit.projectId || commit.project?.id));
      case 'diffStats':
        return !!commit?.stats;
      default:
        return false;
    }
  }
}

export const commitSyncProcessor = new CommitSyncProcessor();

export const processCommitSync = async (job: Job<CommitSyncJobData>): Promise<SyncResult> => {
  try {
    return await commitSyncProcessor.sync(job);
  } catch (error: unknown) {
    logger.error('Commit sync failed', { jobId: job.id, error: error instanceof Error ? error.message : 'Unknown error' });
    throw error;
  }
};

