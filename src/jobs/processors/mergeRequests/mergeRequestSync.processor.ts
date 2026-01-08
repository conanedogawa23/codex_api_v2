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
    const { batchSize = 500 } = options; // Increased batch size for faster syncing
    const projectPath = (options as MergeRequestSyncJobData).projectPath;
    
    logger.info('Fetching merge requests from GitLab', {
      batchSize,
      projectPath: projectPath || 'all active projects'
    });
    
    try {
      let allMergeRequests: any[] = [];

      if (projectPath) {
        // Fetch for specific project
        const mergeRequests = await gitlabMergeRequestProcessor.fetchSimpleMergeRequests(batchSize, projectPath);
        allMergeRequests = mergeRequests;
        
        logger.info('Successfully fetched merge requests for project', {
          count: mergeRequests.length,
          projectPath
        });
      } else {
        // Fetch all active projects from database and sync each one
        const { Project } = await import('../../../models/Project');
        const projects = await Project.find({ isActive: true })
          .select('pathWithNamespace gitlabId name')
          .limit(50) // Limit to first 50 projects to avoid timeout
          .lean();

        logger.info(`Fetching merge requests from ${projects.length} projects`);

        for (const project of projects) {
          try {
            const projectMRs = await gitlabMergeRequestProcessor.fetchSimpleMergeRequests(
              batchSize,
              project.pathWithNamespace
            );
            
            allMergeRequests.push(...projectMRs);
            
            logger.debug(`Fetched ${projectMRs.length} MRs from project: ${project.pathWithNamespace}`);
          } catch (error: unknown) {
            // Log error but continue with other projects
            logger.warn(`Failed to fetch MRs for project ${project.pathWithNamespace}`, {
              error: error instanceof Error ? error.message : 'Unknown error',
              projectId: project.gitlabId
            });
          }
        }

        logger.info('Successfully fetched merge requests from all projects', {
          totalMRs: allMergeRequests.length,
          projectsProcessed: projects.length
        });
      }
      
      return allMergeRequests;
    } catch (error: unknown) {
      logger.error('Failed to fetch merge requests from GitLab', {
        error: error instanceof Error ? error.message : 'Unknown error',
        errorStack: error instanceof Error ? error.stack : undefined,
        batchSize,
        projectPath: projectPath || 'all projects'
      });
      throw error;
    }
  }

  async fetchEntityData(ids: number[]): Promise<any> {
    if (!ids || ids.length === 0) {
      logger.warn('fetchEntityData called with empty IDs array');
      return { data: { mergeRequests: [] } };
    }

    logger.debug('Fetching detailed merge request data', {
      idsCount: ids.length,
      ids: ids.slice(0, 5) // Log first 5 IDs only
    });

    try {
      const data = await gitlabMergeRequestProcessor.fetchMergeRequestData(ids);
      
      const mrCount = data?.data?.mergeRequests?.length || 0;
      logger.debug('Fetched detailed merge request data', {
        requestedCount: ids.length,
        receivedCount: mrCount
      });

      if (mrCount === 0 && ids.length > 0) {
        logger.warn('No merge request data returned for provided IDs', {
          idsCount: ids.length,
          hasData: !!data,
          hasDataField: !!data?.data,
          hasMergeRequests: !!data?.data?.mergeRequests
        });
      }

      return data;
    } catch (error: unknown) {
      logger.error('Failed to fetch detailed merge request data', {
        error: error instanceof Error ? error.message : 'Unknown error',
        errorStack: error instanceof Error ? error.stack : undefined,
        idsCount: ids.length
      });
      throw error;
    }
  }

  async getExisting(gitlabId: number): Promise<any> {
    try {
      const existing = await MergeRequest.findOne({ gitlabId }).lean();
      
      if (existing) {
        logger.debug('Found existing merge request', {
          gitlabId,
          iid: existing.iid,
          projectId: existing.projectId,
          state: existing.state,
          lastSynced: existing.lastSynced
        });
      }
      
      return existing;
    } catch (error: unknown) {
      logger.error('Error checking for existing merge request', {
        gitlabId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }

  mapToModel(gitlabData: any): Partial<IMergeRequest> {
    const syncTime = moment().toDate();
    
    // Validate input data
    if (!gitlabData) {
      logger.warn('mapToModel received null/undefined gitlabData');
      return {};
    }

    // Handle both direct MR object and wrapped mergeRequests array
    let mr: any;
    if (gitlabData.data?.mergeRequests && Array.isArray(gitlabData.data.mergeRequests)) {
      if (gitlabData.data.mergeRequests.length === 0) {
        logger.warn('mapToModel received empty mergeRequests array');
        return {};
      }
      mr = gitlabData.data.mergeRequests[0];
    } else if (gitlabData.mergeRequests && Array.isArray(gitlabData.mergeRequests)) {
      if (gitlabData.mergeRequests.length === 0) {
        logger.warn('mapToModel received empty mergeRequests array');
        return {};
      }
      mr = gitlabData.mergeRequests[0];
    } else {
      mr = gitlabData;
    }

    // Validate MR has required fields
    if (!mr || !mr.id) {
      logger.warn('mapToModel received invalid MR object', {
        hasMr: !!mr,
        hasId: !!mr?.id,
        mrKeys: mr ? Object.keys(mr) : []
      });
      return {};
    }

    const gitlabId = this.extractGitLabId(mr);

    // Extract project ID with fallback
    let projectId = 0;
    if (mr.project?.id) {
      projectId = this.extractNumericId(mr.project.id);
    } else if (mr.projectId) {
      projectId = typeof mr.projectId === 'number' ? mr.projectId : this.extractNumericId(mr.projectId);
    }

    // Validate critical fields
    if (!mr.title || !mr.sourceBranch || !mr.targetBranch) {
      logger.warn('MR missing critical fields', {
        gitlabId,
        hasTitle: !!mr.title,
        hasSourceBranch: !!mr.sourceBranch,
        hasTargetBranch: !!mr.targetBranch
      });
    }

    return {
      gitlabId,
      iid: mr.iid || 0,
      projectId,
      title: mr.title || 'Untitled MR',
      description: mr.description || '',
      state: this.normalizeState(mr.state),
      mergeStatus: this.normalizeMergeStatus(mr.mergeStatus || mr.detailedMergeStatus),
      sourceBranch: mr.sourceBranch || 'unknown',
      targetBranch: mr.targetBranch || 'main',
      labels: this.extractLabels(mr.labels),
      milestone: this.extractMilestone(mr.milestone),
      assignees: this.extractUsers(mr.assignees),
      reviewers: this.extractUsers(mr.reviewers),
      author: this.extractAuthor(mr.author),
      webUrl: mr.webUrl || '',
      createdAt: this.parseDate(mr.createdAt, syncTime),
      updatedAt: this.parseDate(mr.updatedAt, syncTime),
      mergedAt: this.parseDate(mr.mergedAt),
      closedAt: this.parseDate(mr.closedAt),
      lastSynced: syncTime,
      isActive: mr.state !== 'merged' && mr.state !== 'closed',
      syncTimestamps: {}
    };
  }

  private normalizeState(state: string | undefined): 'opened' | 'closed' | 'locked' | 'merged' {
    const normalizedState = (state || 'opened').toLowerCase();
    if (['opened', 'closed', 'locked', 'merged'].includes(normalizedState)) {
      return normalizedState as 'opened' | 'closed' | 'locked' | 'merged';
    }
    return 'opened';
  }

  private normalizeMergeStatus(status: string | undefined): 'can_be_merged' | 'cannot_be_merged' | 'unchecked' {
    const normalizedStatus = (status || 'unchecked').toLowerCase().replace(/-/g, '_');
    if (['can_be_merged', 'cannot_be_merged', 'unchecked'].includes(normalizedStatus)) {
      return normalizedStatus as 'can_be_merged' | 'cannot_be_merged' | 'unchecked';
    }
    return 'unchecked';
  }

  private extractLabels(labels: any): string[] {
    if (!labels) return [];
    if (Array.isArray(labels)) return labels.filter(Boolean);
    if (labels.nodes && Array.isArray(labels.nodes)) {
      return labels.nodes.map((l: any) => l.title || l.name).filter(Boolean);
    }
    return [];
  }

  private extractMilestone(milestone: any): { id: number; title: string; state: 'active' | 'closed' } | undefined {
    if (!milestone || !milestone.id) return undefined;
    return {
      id: this.extractNumericId(milestone.id),
      title: milestone.title || '',
      state: milestone.state === 'closed' ? 'closed' : 'active'
    };
  }

  private extractUsers(users: any): Array<{ id: number; name: string; username: string; avatarUrl?: string }> {
    if (!users) return [];
    const userList = users.nodes || users;
    if (!Array.isArray(userList)) return [];
    
    return userList
      .filter((u: any) => u && u.id)
      .map((u: any) => ({
        id: this.extractNumericId(u.id),
        name: u.name || '',
        username: u.username || '',
        avatarUrl: u.avatarUrl || undefined
      }));
  }

  private extractAuthor(author: any): { id: number; name: string; username: string; avatarUrl?: string } {
    if (!author || !author.id) {
      return { id: 0, name: 'Unknown', username: 'unknown' };
    }
    return {
      id: this.extractNumericId(author.id),
      name: author.name || '',
      username: author.username || '',
      avatarUrl: author.avatarUrl || undefined
    };
  }

  private parseDate(dateString: string | undefined, fallback?: Date): Date | undefined {
    if (!dateString) return fallback;
    try {
      const date = new Date(dateString);
      return isNaN(date.getTime()) ? fallback : date;
    } catch {
      return fallback;
    }
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

