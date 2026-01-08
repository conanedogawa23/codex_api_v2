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

    if (projectPath) {
      return await gitlabLabelProcessor.fetchSimpleLabels(options.batchSize || 200, projectPath);
    }

    // No projectPath - fetch labels from all active projects
    logger.info('Fetching labels from all active projects');
    const Project = require('../../../models/Project').Project;
    const projects = await Project.find({ isActive: true })
      .select('pathWithNamespace')
      .lean();

    logger.info('Found active projects for label sync', { count: projects.length });

    const allLabels: any[] = [];
    for (const project of projects) {
      try {
        const labels = await gitlabLabelProcessor.fetchSimpleLabels(
          options.batchSize || 200,
          project.pathWithNamespace
        );
        allLabels.push(...labels);
      } catch (error) {
        logger.warn('Failed to fetch labels for project', {
          projectPath: project.pathWithNamespace,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    logger.info('Fetched labels from all projects', { totalLabels: allLabels.length });
    return allLabels;
  }

  async fetchEntityData(ids: number[], projectPath?: string): Promise<any> {
    return await gitlabLabelProcessor.fetchLabelData(ids, projectPath);
  }

  /**
   * Override processEntity to pass projectPath parameter
   */
  protected async processEntity(
    entity: any,
    categorySyncResults: { [category: string]: import('../base/baseSyncProcessor').CategorySyncResult }
  ): Promise<{ created: boolean; updated: boolean; skipped: boolean }> {
    const gitlabId = this.extractGitLabId(entity);
    const projectPath = entity.projectPath;

    if (!projectPath) {
      logger.error('Label entity missing projectPath', { gitlabId });
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

      const detailedData = await this.fetchEntityData([gitlabId], projectPath);

      if (!detailedData || !detailedData.data) {
        logger.warn(`No detailed data found for ${this.entityName}`, { gitlabId, projectPath });
        return { created: false, updated: false, skipped: true };
      }

      const mappedData = this.mapToModel(detailedData.data);
      this.updateCategoryTimestamps(mappedData, detailedData.data, categorySyncResults);
      const savedEntity = await this.updateModel(mappedData);

      if (savedEntity) {
        logger.debug(`Updated ${this.entityName}`, { gitlabId, projectPath });
        return { created: false, updated: true, skipped: false };
      }

      logger.warn(`Failed to update ${this.entityName}`, { gitlabId, projectPath });
      return { created: false, updated: false, skipped: true };
    }

    const detailedData = await this.fetchEntityData([gitlabId], projectPath);

    if (!detailedData || !detailedData.data) {
      logger.warn(`No detailed data found for new ${this.entityName}`, { gitlabId, projectPath });
      return { created: false, updated: false, skipped: true };
    }

    const mappedData = this.mapToModel(detailedData.data);
    this.updateCategoryTimestamps(mappedData, detailedData.data, categorySyncResults);
    const savedEntity = await this.updateModel(mappedData);

    if (savedEntity) {
      logger.debug(`Created ${this.entityName}`, { gitlabId, projectPath });
      return { created: true, updated: false, skipped: false };
    }

    logger.warn(`Failed to create ${this.entityName}`, { gitlabId, projectPath });
    return { created: false, updated: false, skipped: true };
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
      projectId: label.project?.id ? String(this.extractGitLabId(label.project)) : '',
      name: label.name || label.title || '',
      color: label.color || '#000000',
      description: label.description || '',
      descriptionHtml: label.descriptionHtml || undefined,
      textColor: label.textColor || '#FFFFFF',
      priority: label.priority || undefined,
      subscribed: label.subscribed || false,
      openIssuesCount: label.openIssuesCount || 0,
      closedIssuesCount: label.closedIssuesCount || 0,
      openMergeRequestsCount: label.openMergeRequestsCount || 0,
      isProjectLabel: label.isProjectLabel !== undefined ? label.isProjectLabel : true,
      webUrl: label.webUrl || undefined,
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

