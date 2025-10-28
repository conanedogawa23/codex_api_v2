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

  async fetchEntityData(ids: number[]): Promise<any> {
    return await gitlabNamespaceProcessor.fetchNamespaceData(ids);
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
      fullPath: ns.fullPath || ns.path || '',
      description: ns.description || '',
      visibility: ns.visibility || 'private',
      kind: ns.kind || 'user',
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

