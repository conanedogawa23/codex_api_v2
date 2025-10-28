import { Job } from 'bull';
import { BaseSyncProcessor, SyncOptions, SyncResult } from '../base/baseSyncProcessor';
import { Project, IProject } from '../../../models/Project';
import { logger } from '../../../utils/logger';
import { gitlabProjectProcessor } from './gitlabProjectProcessor';
import moment from 'moment-timezone';

/**
 * Project Sync Job Data Interface
 */
export interface ProjectSyncJobData extends SyncOptions {
  namespaceId?: string; // Optional: Sync projects for specific namespace
  projectIds?: number[]; // Optional: Sync specific projects only
}

/**
 * Project Sync Processor
 * Extends BaseSyncProcessor to handle project-specific sync logic
 * 
 * Categories:
 * 1. coreData - Basic project information
 * 2. members - Project members and access levels
 * 3. statistics - Project statistics and counts
 * 4. repository - Repository information and languages
 * 5. cicdSettings - CI/CD configuration and runners
 * 6. containerRegistry - Container registry settings
 * 7. releases - Releases and tags
 * 8. mergeRequestSettings - MR settings and approval rules
 */
class ProjectSyncProcessor extends BaseSyncProcessor<IProject> {
  readonly entityName = 'project';
  readonly categories = [
    'coreData',
    'members',
    'statistics',
    'repository',
    'cicdSettings',
    'containerRegistry',
    'releases',
    'mergeRequestSettings'
  ];

  /**
   * Fetch projects from GitLab
   */
  async fetchFromGitLab(options: SyncOptions): Promise<any[]> {
    const { batchSize = 100 } = options;
    return await gitlabProjectProcessor.fetchSimpleProjects(batchSize);
  }

  /**
   * Fetch detailed project data from GitLab
   */
  async fetchEntityData(ids: number[]): Promise<any> {
    return await gitlabProjectProcessor.fetchProjectData(ids);
  }

  /**
   * Get existing project from database
   */
  async getExisting(gitlabId: number): Promise<any> {
    return await Project.findOne({ gitlabId }).lean();
  }

  /**
   * Map GitLab data to Project model format
   */
  mapToModel(gitlabData: any): Partial<IProject> {
    const syncTime = moment().toDate();
    
    if (!gitlabData || !gitlabData.projects || gitlabData.projects.length === 0) {
      logger.warn('No project data to map');
      return {};
    }

    const project = gitlabData.projects[0]; // Get first project from array
    
    // Extract GitLab ID from global ID format
    const gitlabId = this.extractGitLabId(project);

    const mappedData: Partial<IProject> = {
      gitlabId,
      name: project.name || '',
      nameWithNamespace: project.fullPath || project.name || '',
      description: project.description || '',
      defaultBranch: project.repository?.rootRef || project.defaultBranch || 'main',
      visibility: project.visibility || 'private',
      webUrl: project.webUrl || '',
      httpUrlToRepo: project.httpUrlToRepo || '',
      sshUrlToRepo: project.sshUrlToRepo || '',
      pathWithNamespace: project.fullPath || project.path || '',
      
      // Namespace information
      namespace: {
        id: project.namespace?.id ? this.extractNumericId(project.namespace.id) : 0,
        name: project.namespace?.name || '',
        path: project.namespace?.path || '',
        kind: project.namespace?.kind || 'user'
      },

      // Activity timestamps
      createdAt: project.createdAt ? new Date(project.createdAt) : syncTime,
      lastActivityAt: project.lastActivityAt ? new Date(project.lastActivityAt) : syncTime,
      lastSynced: syncTime,
      isActive: !project.archived,

      // Default values for internal fields (not from GitLab)
      status: 'active',
      progress: 0,
      priority: 'medium',
      category: project.topics?.[0] || 'general',
      assignedTo: [],
      tasks: {
        total: 0,
        completed: 0,
        inProgress: 0,
        pending: 0
      },

      // Sync timestamps (will be populated by updateCategoryTimestamps)
      syncTimestamps: {}
    };

    return mappedData;
  }

  /**
   * Update or create project in database
   */
  async updateModel(data: Partial<IProject>): Promise<IProject | null> {
    try {
      if (!data.gitlabId) {
        logger.error('Cannot update project without gitlabId');
        return null;
      }

      // Use findOneAndUpdate with upsert to create or update
      const updated = await Project.findOneAndUpdate(
        { gitlabId: data.gitlabId },
        { $set: data },
        { new: true, upsert: true, runValidators: true }
      );

      return updated;
    } catch (error: unknown) {
      logger.error('Error updating project model', {
        gitlabId: data.gitlabId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }

  /**
   * Check if project should skip sync
   * Skip archived projects unless fullSync is enabled
   */
  protected shouldSkipSync(existingEntity: any): boolean {
    // Skip archived projects
    if (existingEntity.isActive === false) {
      logger.debug('Skipping archived project', {
        projectId: existingEntity.gitlabId,
        name: existingEntity.name
      });
      return true;
    }

    return false;
  }

  /**
   * Check if category data is available in GitLab response
   */
  protected isCategoryDataAvailable(gitlabData: any, category: string): boolean {
    if (!gitlabData || !gitlabData.projects || gitlabData.projects.length === 0) {
      return false;
    }

    const project = gitlabData.projects[0];

    switch (category) {
      case 'coreData':
        return !!(project.id && project.name);
      
      case 'members':
        return !!(project.projectMembers !== undefined);
      
      case 'statistics':
        return !!(project.statistics !== undefined || 
                 project.issuesCount !== undefined);
      
      case 'repository':
        return !!(project.repository !== undefined || 
                 project.languages !== undefined);
      
      case 'cicdSettings':
        return !!(project.ciConfigPath !== undefined || 
                 project.ciCdSettings !== undefined || 
                 project.runners !== undefined);
      
      case 'containerRegistry':
        return !!(project.containerRegistryEnabled !== undefined || 
                 project.containerExpirationPolicy !== undefined || 
                 project.containerRepositories !== undefined);
      
      case 'releases':
        return !!(project.releases !== undefined);
      
      case 'mergeRequestSettings':
        return !!(project.approvalRules !== undefined || 
                 project.mergeCommitTemplate !== undefined);
      
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
export const projectSyncProcessor = new ProjectSyncProcessor();

/**
 * Process project sync job
 * Entry point for Bull queue processor
 */
export const processProjectSync = async (
  job: Job<ProjectSyncJobData>
): Promise<SyncResult> => {
  logger.info('Starting project sync job', {
    jobId: job.id,
    data: job.data
  });

  try {
    const result = await projectSyncProcessor.sync(job);
    
    logger.info('Project sync job completed', {
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
    logger.error('Project sync job failed', {
      jobId: job.id,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    throw error;
  }
};

