import { Job } from 'bull';
import { BaseSyncProcessor, SyncOptions, SyncResult } from '../base/baseSyncProcessor';
import { Issue, IIssue } from '../../../models/Issue';
import { logger } from '../../../utils/logger';
import { gitlabIssueProcessor } from './gitlabIssueProcessor';
import moment from 'moment-timezone';

/**
 * Issue Sync Job Data Interface
 */
export interface IssueSyncJobData extends SyncOptions {
  projectPath?: string; // Optional: Sync issues for specific project
  issueIds?: number[]; // Optional: Sync specific issues only
}

/**
 * Issue Sync Processor
 * Extends BaseSyncProcessor to handle issue-specific sync logic
 * 
 * Categories:
 * 1. coreData - Basic issue information
 * 2. assigneesAuthor - People involved (assignees, author)
 * 3. labelsMilestones - Categorization (labels, milestones, epic)
 * 4. relatedMRs - Related merge requests
 * 5. issueLinks - Linked issues (blocks, blocked by, related)
 * 6. timeTracking - Time estimates and spent
 */
class IssueSyncProcessor extends BaseSyncProcessor<IIssue> {
  readonly entityName = 'issue';
  readonly categories = [
    'coreData',
    'assigneesAuthor',
    'labelsMilestones',
    'relatedMRs',
    'issueLinks',
    'timeTracking'
  ];

  /**
   * Fetch issues from GitLab
   */
  async fetchFromGitLab(options: SyncOptions): Promise<any[]> {
    const { batchSize = 100 } = options;
    const projectPath = (options as IssueSyncJobData).projectPath;
    return await gitlabIssueProcessor.fetchSimpleIssues(batchSize, projectPath);
  }

  /**
   * Fetch detailed issue data from GitLab
   */
  async fetchEntityData(ids: number[]): Promise<any> {
    return await gitlabIssueProcessor.fetchIssueData(ids);
  }

  /**
   * Get existing issue from database
   */
  async getExisting(gitlabId: number): Promise<any> {
    return await Issue.findOne({ gitlabId }).lean();
  }

  /**
   * Map GitLab data to Issue model format
   */
  mapToModel(gitlabData: any): Partial<IIssue> {
    const syncTime = moment().toDate();
    
    if (!gitlabData || !gitlabData.issues || gitlabData.issues.length === 0) {
      logger.warn('No issue data to map');
      return {};
    }

    const issue = gitlabData.issues[0]; // Get first issue from array
    
    // Extract GitLab ID from global ID format
    const gitlabId = this.extractGitLabId(issue);

    const mappedData: Partial<IIssue> = {
      gitlabId,
      iid: issue.iid || 0,
      projectId: issue.project?.id ? this.extractNumericId(issue.project.id) : 0,
      title: issue.title || '',
      description: issue.description || '',
      state: issue.state === 'closed' ? 'closed' : 'opened',
      
      // Map author
      author: issue.author ? {
        id: this.extractNumericId(issue.author.id),
        name: issue.author.name || '',
        username: issue.author.username || '',
        email: '',
        avatarUrl: issue.author.avatarUrl || ''
      } : {
        id: 0,
        name: '',
        username: '',
        email: ''
      },

      // Map assignees
      assignees: (issue.assignees?.nodes || []).map((assignee: any) => ({
        id: this.extractNumericId(assignee.id),
        name: assignee.name || '',
        username: assignee.username || '',
        email: '',
        avatarUrl: assignee.avatarUrl || ''
      })),

      // Map labels
      labels: (issue.labels?.nodes || []).map((label: any) => label.title).filter(Boolean),

      // Map milestone
      milestone: issue.milestone ? {
        id: this.extractNumericId(issue.milestone.id),
        title: issue.milestone.title || '',
        description: issue.milestone.description || '',
        state: issue.milestone.state === 'closed' ? 'closed' : 'active',
        dueDate: issue.milestone.dueDate ? new Date(issue.milestone.dueDate) : undefined
      } : undefined,

      webUrl: issue.webUrl || '',
      
      // Timestamps
      createdAt: issue.createdAt ? new Date(issue.createdAt) : syncTime,
      updatedAt: issue.updatedAt ? new Date(issue.updatedAt) : syncTime,
      closedAt: issue.closedAt ? new Date(issue.closedAt) : undefined,
      dueDate: issue.dueDate ? new Date(issue.dueDate) : undefined,
      lastSynced: syncTime,
      isActive: issue.state !== 'closed',

      // Default values for internal fields (not from GitLab)
      priority: 'medium',
      completionPercentage: issue.state === 'closed' ? 100 : 0,
      tags: [],
      estimatedHours: issue.timeEstimate ? issue.timeEstimate / 3600 : undefined, // Convert seconds to hours
      actualHours: issue.totalTimeSpent ? issue.totalTimeSpent / 3600 : undefined, // Convert seconds to hours

      // Sync timestamps (will be populated by updateCategoryTimestamps)
      syncTimestamps: {}
    };

    return mappedData;
  }

  /**
   * Update or create issue in database
   */
  async updateModel(data: Partial<IIssue>): Promise<IIssue | null> {
    try {
      if (!data.gitlabId) {
        logger.error('Cannot update issue without gitlabId');
        return null;
      }

      // Use findOneAndUpdate with upsert to create or update
      const updated = await Issue.findOneAndUpdate(
        { gitlabId: data.gitlabId },
        { $set: data },
        { new: true, upsert: true, runValidators: true }
      );

      return updated;
    } catch (error: unknown) {
      logger.error('Error updating issue model', {
        gitlabId: data.gitlabId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }

  /**
   * Check if issue should skip sync
   * Skip closed issues older than 6 months unless fullSync is enabled
   */
  protected shouldSkipSync(existingEntity: any): boolean {
    // Skip very old closed issues to reduce sync load
    if (existingEntity.state === 'closed' && existingEntity.closedAt) {
      const sixMonthsAgo = moment().subtract(6, 'months');
      const closedDate = moment(existingEntity.closedAt);
      
      if (closedDate.isBefore(sixMonthsAgo)) {
        logger.debug('Skipping old closed issue', {
          issueId: existingEntity.gitlabId,
          title: existingEntity.title,
          closedAt: existingEntity.closedAt
        });
        return true;
      }
    }

    return false;
  }

  /**
   * Check if category data is available in GitLab response
   */
  protected isCategoryDataAvailable(gitlabData: any, category: string): boolean {
    if (!gitlabData || !gitlabData.issues || gitlabData.issues.length === 0) {
      return false;
    }

    const issue = gitlabData.issues[0];

    switch (category) {
      case 'coreData':
        return !!(issue.id && issue.title);
      
      case 'assigneesAuthor':
        return !!(issue.author !== undefined || issue.assignees !== undefined);
      
      case 'labelsMilestones':
        return !!(issue.labels !== undefined || issue.milestone !== undefined || issue.epic !== undefined);
      
      case 'relatedMRs':
        return !!(issue.relatedMergeRequests !== undefined || issue.closingMergeRequests !== undefined);
      
      case 'issueLinks':
        return !!(issue.blockedByIssues !== undefined || issue.blockingIssues !== undefined || issue.relatedIssues !== undefined);
      
      case 'timeTracking':
        return !!(issue.timeEstimate !== undefined || issue.totalTimeSpent !== undefined || issue.timelogs !== undefined);
      
      default:
        return super.isCategoryDataAvailable(gitlabData, category);
    }
  }

  /**
   * Extract numeric ID from GitLab global ID format
   * @private
   */
  private extractNumericId(globalId: string): number {
    if (typeof globalId === 'number') return globalId;
    const match = globalId.match(/\d+$/);
    return match ? parseInt(match[0]) : 0;
  }
}

// Create and export singleton instance
export const issueSyncProcessor = new IssueSyncProcessor();

/**
 * Process issue sync job
 * Entry point for Bull queue processor
 */
export const processIssueSync = async (
  job: Job<IssueSyncJobData>
): Promise<SyncResult> => {
  logger.info('Starting issue sync job', {
    jobId: job.id,
    data: job.data
  });

  try {
    const result = await issueSyncProcessor.sync(job);
    
    logger.info('Issue sync job completed', {
      jobId: job.id,
      result: {
        success: result.success,
        processed: result.processed,
        created: result.created,
        updated: result.updated,
        skipped: result.skipped,
        errors: result.errors,
        duration: result.duration
      }
    });

    return result;
  } catch (error: unknown) {
    logger.error('Issue sync job failed', {
      jobId: job.id,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    throw error;
  }
};

