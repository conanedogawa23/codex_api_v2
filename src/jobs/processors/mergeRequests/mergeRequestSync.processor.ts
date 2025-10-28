import { Job } from 'bull';
import { BaseSyncProcessor, SyncOptions, SyncResult } from '../base/baseSyncProcessor';
import { MergeRequest, IMergeRequest } from '../../../models/MergeRequest';
import { logger } from '../../../utils/logger';
import { gitlabMergeRequestProcessor } from './gitlabMergeRequestProcessor';
import moment from 'moment-timezone';

export interface MergeRequestSyncJobData extends SyncOptions {
  projectPath?: string;
  mrIds?: number[];
}

class MergeRequestSyncProcessor extends BaseSyncProcessor<IMergeRequest> {
  readonly entityName = 'mergeRequest';
  readonly categories = [
    'coreData',
    'reviewersAssignees',
    'approvals',
    'pipelines',
    'diffStats',
    'discussions',
    'commits',
    'changes'
  ];

  async fetchFromGitLab(options: SyncOptions): Promise<any[]> {
    const { batchSize = 100 } = options;
    const projectPath = (options as MergeRequestSyncJobData).projectPath;
    return await gitlabMergeRequestProcessor.fetchSimpleMergeRequests(batchSize, projectPath);
  }

  async fetchEntityData(ids: number[]): Promise<any> {
    return await gitlabMergeRequestProcessor.fetchMergeRequestData(ids);
  }

  async getExisting(gitlabId: number): Promise<any> {
    return await MergeRequest.findOne({ gitlabId }).lean();
  }

  mapToModel(gitlabData: any): Partial<IMergeRequest> {
    const syncTime = moment().toDate();
    if (!gitlabData || !gitlabData.mergeRequests || gitlabData.mergeRequests.length === 0) {
      return {};
    }

    const mr = gitlabData.mergeRequests[0];
    const gitlabId = this.extractGitLabId(mr);

    return {
      gitlabId,
      iid: mr.iid || 0,
      projectId: mr.project?.id ? this.extractNumericId(mr.project.id) : 0,
      title: mr.title || '',
      description: mr.description || '',
      state: mr.state || 'opened',
      mergeStatus: mr.mergeStatus || 'unchecked',
      sourceBranch: mr.sourceBranch || '',
      targetBranch: mr.targetBranch || '',
      labels: (mr.labels?.nodes || []).map((l: any) => l.title).filter(Boolean),
      milestone: mr.milestone ? {
        id: this.extractNumericId(mr.milestone.id),
        title: mr.milestone.title || '',
        state: 'active'
      } : undefined,
      assignees: (mr.assignees?.nodes || []).map((a: any) => ({
        id: this.extractNumericId(a.id),
        name: a.name || '',
        username: a.username || '',
        avatarUrl: a.avatarUrl || ''
      })),
      reviewers: (mr.reviewers?.nodes || []).map((r: any) => ({
        id: this.extractNumericId(r.id),
        name: r.name || '',
        username: r.username || '',
        avatarUrl: r.avatarUrl || ''
      })),
      author: mr.author ? {
        id: this.extractNumericId(mr.author.id),
        name: mr.author.name || '',
        username: mr.author.username || '',
        avatarUrl: mr.author.avatarUrl || ''
      } : { id: 0, name: '', username: '' },
      webUrl: mr.webUrl || '',
      createdAt: mr.createdAt ? new Date(mr.createdAt) : syncTime,
      updatedAt: mr.updatedAt ? new Date(mr.updatedAt) : syncTime,
      mergedAt: mr.mergedAt ? new Date(mr.mergedAt) : undefined,
      lastSynced: syncTime,
      isActive: mr.state !== 'merged' && mr.state !== 'closed',
      syncTimestamps: {}
    };
  }

  async updateModel(data: Partial<IMergeRequest>): Promise<IMergeRequest | null> {
    try {
      if (!data.gitlabId) return null;
      return await MergeRequest.findOneAndUpdate(
        { gitlabId: data.gitlabId },
        { $set: data },
        { new: true, upsert: true, runValidators: true }
      );
    } catch (error: unknown) {
      logger.error('Error updating merge request model', {
        gitlabId: data.gitlabId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }

  protected shouldSkipSync(existingEntity: any): boolean {
    if (existingEntity.state === 'merged' && existingEntity.mergedAt) {
      const threeMonthsAgo = moment().subtract(3, 'months');
      if (moment(existingEntity.mergedAt).isBefore(threeMonthsAgo)) {
        return true;
      }
    }
    return false;
  }

  protected isCategoryDataAvailable(gitlabData: any, category: string): boolean {
    if (!gitlabData || !gitlabData.mergeRequests || gitlabData.mergeRequests.length === 0) {
      return false;
    }
    const mr = gitlabData.mergeRequests[0];
    switch (category) {
      case 'coreData':
        return !!(mr.id && mr.title);
      case 'reviewersAssignees':
        return !!(mr.author !== undefined || mr.assignees !== undefined || mr.reviewers !== undefined);
      case 'approvals':
        return !!(mr.approved !== undefined || mr.approvalState !== undefined);
      case 'pipelines':
        return !!(mr.headPipeline !== undefined || mr.pipelines !== undefined);
      case 'diffStats':
        return !!(mr.diffStats !== undefined || mr.diffStatsSummary !== undefined);
      case 'discussions':
        return !!(mr.discussions !== undefined);
      case 'commits':
        return !!(mr.commits !== undefined);
      case 'changes':
        return !!(mr.diffRefs !== undefined);
      default:
        return super.isCategoryDataAvailable(gitlabData, category);
    }
  }

  private extractNumericId(globalId: string): number {
    if (typeof globalId === 'number') return globalId;
    const match = globalId.match(/\d+$/);
    return match ? parseInt(match[0]) : 0;
  }
}

export const mergeRequestSyncProcessor = new MergeRequestSyncProcessor();

export const processMergeRequestSync = async (job: Job<MergeRequestSyncJobData>): Promise<SyncResult> => {
  logger.info('Starting merge request sync job', { jobId: job.id });
  try {
    const result = await mergeRequestSyncProcessor.sync(job);
    logger.info('Merge request sync job completed', { jobId: job.id, result });
    return result;
  } catch (error: unknown) {
    logger.error('Merge request sync job failed', {
      jobId: job.id,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
};

