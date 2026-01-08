import { Job } from 'bull';
import { BaseSyncProcessor, SyncOptions, SyncResult } from '../base/baseSyncProcessor';
import { Commit, ICommit } from '../../../models/Commit';
import { logger } from '../../../utils/logger';
import { gitlabCommitProcessor } from './gitlabCommitProcessor';
import moment from 'moment-timezone';

export interface CommitSyncJobData extends SyncOptions {
  projectPath?: string;
}

class CommitSyncProcessor extends BaseSyncProcessor<ICommit> {
  readonly entityName = 'commit';
  readonly categories = ['coreData', 'diffStats', 'references', 'signatures'];

  async fetchFromGitLab(options: SyncOptions): Promise<any[]> {
    const projectPath = (options as CommitSyncJobData).projectPath;

    if (projectPath) {
      return await gitlabCommitProcessor.fetchSimpleCommits(options.batchSize || 100, projectPath);
    }

    // No projectPath - fetch commits from all active projects
    logger.info('Fetching commits from all active projects');
    const Project = require('../../../models/Project').Project;
    const projects = await Project.find({ isActive: true })
      .select('pathWithNamespace')
      .lean();

    logger.info('Found active projects for commit sync', { count: projects.length });

    const allCommits: any[] = [];
    for (const project of projects) {
      try {
        const commits = await gitlabCommitProcessor.fetchSimpleCommits(
          options.batchSize || 100,
          project.pathWithNamespace
        );
        allCommits.push(...commits);
      } catch (error) {
        logger.warn('Failed to fetch commits for project', {
          projectPath: project.pathWithNamespace,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    logger.info('Fetched commits from all projects', { totalCommits: allCommits.length });
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
    const gitlabId = this.extractGitLabId(entity);
    const projectPath = entity.projectPath;
    const sha = entity.sha;

    if (!projectPath || !sha) {
      logger.error('Commit entity missing projectPath or sha', { gitlabId });
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

      const detailedData = await this.fetchEntityData([gitlabId], projectPath, sha);

      if (!detailedData || !detailedData.data) {
        logger.warn(`No detailed data found for ${this.entityName}`, { gitlabId, projectPath, sha });
        return { created: false, updated: false, skipped: true };
      }

      const mappedData = this.mapToModel(detailedData.data);
      this.updateCategoryTimestamps(mappedData, detailedData.data, categorySyncResults);
      const savedEntity = await this.updateModel(mappedData);

      if (savedEntity) {
        logger.debug(`Updated ${this.entityName}`, { gitlabId, projectPath, sha });
        return { created: false, updated: true, skipped: false };
      }

      logger.warn(`Failed to update ${this.entityName}`, { gitlabId, projectPath, sha });
      return { created: false, updated: false, skipped: true };
    }

    const detailedData = await this.fetchEntityData([gitlabId], projectPath, sha);

    if (!detailedData || !detailedData.data) {
      logger.warn(`No detailed data found for new ${this.entityName}`, { gitlabId, projectPath, sha });
      return { created: false, updated: false, skipped: true };
    }

    const mappedData = this.mapToModel(detailedData.data);
    this.updateCategoryTimestamps(mappedData, detailedData.data, categorySyncResults);
    const savedEntity = await this.updateModel(mappedData);

    if (savedEntity) {
      logger.debug(`Created ${this.entityName}`, { gitlabId, projectPath, sha });
      return { created: true, updated: false, skipped: false };
    }

    logger.warn(`Failed to create ${this.entityName}`, { gitlabId, projectPath, sha });
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

export const processCommitSync = async (job: Job<CommitSyncJobData>): Promise<SyncResult> => {
  try {
    return await commitSyncProcessor.sync(job);
  } catch (error: unknown) {
    logger.error('Commit sync failed', { jobId: job.id, error: error instanceof Error ? error.message : 'Unknown error' });
    throw error;
  }
};

