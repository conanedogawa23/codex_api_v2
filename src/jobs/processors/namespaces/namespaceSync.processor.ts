import { Job } from 'bull';
import { BaseSyncProcessor, SyncOptions, SyncResult } from '../base/baseSyncProcessor';
import { Namespace, INamespace } from '../../../models/Namespace';
import { logger } from '../../../utils/logger';
import { gitlabNamespaceProcessor } from './gitlabNamespaceProcessor';
import moment from 'moment-timezone';

class NamespaceSyncProcessor extends BaseSyncProcessor<INamespace> {
  readonly entityName = 'namespace';
  readonly categories = ['coreData', 'projects', 'groups', 'statistics'];

  async fetchFromGitLab(options: SyncOptions): Promise<any[]> {
    return await gitlabNamespaceProcessor.fetchSimpleNamespaces(options.batchSize || 100);
  }

  async fetchEntityData(ids: number[], fullPath?: string): Promise<any> {
    return await gitlabNamespaceProcessor.fetchNamespaceData(ids, fullPath);
  }

  /**
   * Override processEntity to pass fullPath parameter
   */
  protected async processEntity(
    entity: any,
    categorySyncResults: { [category: string]: import('../base/baseSyncProcessor').CategorySyncResult }
  ): Promise<{ created: boolean; updated: boolean; skipped: boolean }> {
    const gitlabId = this.extractGitLabId(entity);
    const fullPath = entity.fullPath;

    if (!fullPath) {
      logger.error('Namespace entity missing fullPath', { gitlabId });
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

      // Fetch detailed data with all categories, passing fullPath
      const detailedData = await this.fetchEntityData([gitlabId], fullPath);

      if (!detailedData || !detailedData.data) {
        logger.warn(`No detailed data found for ${this.entityName}`, { gitlabId, fullPath });
        return { created: false, updated: false, skipped: true };
      }

      // Map GitLab data to model
      const mappedData = this.mapToModel(detailedData.data);

      // Update category sync timestamps
      this.updateCategoryTimestamps(mappedData, detailedData.data, categorySyncResults);

      // Update in database
      const savedEntity = await this.updateModel(mappedData);

      if (savedEntity) {
        logger.debug(`Updated ${this.entityName}`, { gitlabId, fullPath });
        return { created: false, updated: true, skipped: false };
      }

      logger.warn(`Failed to update ${this.entityName}`, { gitlabId, fullPath });
      return { created: false, updated: false, skipped: true };
    }

    // New entity - fetch detailed data and create, passing fullPath
    const detailedData = await this.fetchEntityData([gitlabId], fullPath);

    if (!detailedData || !detailedData.data) {
      logger.warn(`No detailed data found for new ${this.entityName}`, { gitlabId, fullPath });
      return { created: false, updated: false, skipped: true };
    }

    // Map GitLab data to model
    const mappedData = this.mapToModel(detailedData.data);

    // Update category sync timestamps
    this.updateCategoryTimestamps(mappedData, detailedData.data, categorySyncResults);

    // Create in database
    const savedEntity = await this.updateModel(mappedData);

    if (savedEntity) {
      logger.debug(`Created ${this.entityName}`, { gitlabId, fullPath });
      return { created: true, updated: false, skipped: false };
    }

    logger.warn(`Failed to create ${this.entityName}`, { gitlabId, fullPath });
    return { created: false, updated: false, skipped: true };
  }

  async getExisting(gitlabId: number): Promise<any> {
    return await Namespace.findOne({ gitlabId }).lean();
  }

  mapToModel(gitlabData: any): Partial<INamespace> {
    const syncTime = moment().toDate();
    if (!gitlabData || !gitlabData.namespaces || gitlabData.namespaces.length === 0) {
      return {};
    }

    const ns = gitlabData.namespaces[0];
    const gitlabId = this.extractGitLabId(ns);

    return {
      gitlabId,
      name: ns.name || '',
      path: ns.path || '',
      kind: ns.kind || 'user',
      fullName: ns.fullName || ns.name || '',
      fullPath: ns.fullPath || ns.path || '',
      parentId: ns.parentId || undefined,
      avatarUrl: ns.avatarUrl || undefined,
      webUrl: ns.webUrl || '',
      membersCountWithDescendants: ns.membersCountWithDescendants || undefined,
      billableMembersCount: ns.billableMembersCount || undefined,
      maxSeatsUsed: ns.maxSeatsUsed || undefined,
      seatsInUse: ns.seatsInUse || undefined,
      planName: ns.planName || undefined,
      trialEndsOn: ns.trialEndsOn ? new Date(ns.trialEndsOn) : undefined,
      trial: ns.trial || false,
      createdAt: ns.createdAt ? new Date(ns.createdAt) : syncTime,
      updatedAt: ns.updatedAt ? new Date(ns.updatedAt) : syncTime,
      lastSyncedAt: syncTime,
      isDeleted: false,
      syncTimestamps: {}
    };
  }

  async updateModel(data: Partial<INamespace>): Promise<INamespace | null> {
    try {
      if (!data.gitlabId) return null;
      return await Namespace.findOneAndUpdate(
        { gitlabId: data.gitlabId },
        { $set: data },
        { new: true, upsert: true, runValidators: true }
      );
    } catch (error: unknown) {
      logger.error('Error updating namespace model', {
        gitlabId: data.gitlabId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }

  protected isCategoryDataAvailable(gitlabData: any, category: string): boolean {
    if (!gitlabData || !gitlabData.namespaces || gitlabData.namespaces.length === 0) {
      return false;
    }
    const ns = gitlabData.namespaces[0];
    switch (category) {
      case 'coreData':
        return !!(ns.id && ns.name);
      case 'projects':
        return !!(ns.projects !== undefined);
      case 'groups':
        return !!(ns.groups !== undefined);
      case 'statistics':
        return !!(ns.statistics !== undefined);
      default:
        return super.isCategoryDataAvailable(gitlabData, category);
    }
  }
}

export const namespaceSyncProcessor = new NamespaceSyncProcessor();

export const processNamespaceSync = async (job: Job<SyncOptions>): Promise<SyncResult> => {
  logger.info('Starting namespace sync job', { jobId: job.id });
  try {
    const result = await namespaceSyncProcessor.sync(job);
    logger.info('Namespace sync job completed', { jobId: job.id, result });
    return result;
  } catch (error: unknown) {
    logger.error('Namespace sync job failed', {
      jobId: job.id,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
};

