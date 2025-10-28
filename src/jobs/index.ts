import { logger } from '../utils/logger';
import { closeQueues, issueSyncQueue, mergeRequestSyncQueue, namespaceSyncQueue } from './config/queue';
import {
  initializeUserSyncScheduler,
  triggerImmediateSync,
  getUserSyncSchedulerStatus,
  pauseUserSyncScheduler,
  resumeUserSyncScheduler,
  cleanupOldJobs,
} from './schedulers/userSync.scheduler';
import {
  initializeProjectSyncScheduler,
  triggerImmediateSync as triggerProjectImmediateSync,
  getProjectSyncSchedulerStatus,
  pauseProjectSyncScheduler,
  resumeProjectSyncScheduler,
  cleanupOldJobs as cleanupProjectOldJobs,
} from './schedulers/projectSync.scheduler';
import { IssueSyncScheduler } from './schedulers/issueSync.scheduler';
import { MergeRequestSyncScheduler } from './schedulers/mergeRequestSync.scheduler';
import { NamespaceSyncScheduler } from './schedulers/namespaceSync.scheduler';
import { processIssueSync } from './processors/issues/issueSync.processor';
import { processMergeRequestSync } from './processors/mergeRequests/mergeRequestSync.processor';
import { processNamespaceSync } from './processors/namespaces/namespaceSync.processor';

/**
 * Job Manager
 * Centralized management for all background jobs
 */
export class JobManager {
  private static instance: JobManager;
  private isInitialized: boolean = false;
  private issueSyncScheduler?: IssueSyncScheduler;
  private mergeRequestSyncScheduler?: MergeRequestSyncScheduler;
  private namespaceSyncScheduler?: NamespaceSyncScheduler;

  private constructor() {}

  public static getInstance(): JobManager {
    if (!JobManager.instance) {
      JobManager.instance = new JobManager();
    }
    return JobManager.instance;
  }

  /**
   * Initialize all job schedulers
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('Job manager already initialized');
      return;
    }

    try {
      logger.info('Initializing job manager...');

      // Initialize user sync scheduler
      await initializeUserSyncScheduler();

      // Initialize project sync scheduler
      await initializeProjectSyncScheduler();

      // Initialize issue sync scheduler
      this.issueSyncScheduler = new IssueSyncScheduler(issueSyncQueue);
      issueSyncQueue.process(processIssueSync);
      await this.issueSyncScheduler.scheduleRecurring();
      logger.info('Issue sync scheduler initialized');

      // Initialize merge request sync scheduler
      this.mergeRequestSyncScheduler = new MergeRequestSyncScheduler(mergeRequestSyncQueue);
      mergeRequestSyncQueue.process(processMergeRequestSync);
      await this.mergeRequestSyncScheduler.scheduleRecurring();
      logger.info('Merge request sync scheduler initialized');

      // Initialize namespace sync scheduler
      this.namespaceSyncScheduler = new NamespaceSyncScheduler(namespaceSyncQueue);
      namespaceSyncQueue.process(processNamespaceSync);
      await this.namespaceSyncScheduler.scheduleRecurring();
      logger.info('Namespace sync scheduler initialized');

      this.isInitialized = true;
      logger.info('Job manager initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize job manager', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  /**
   * Gracefully shutdown all jobs
   */
  public async shutdown(): Promise<void> {
    try {
      logger.info('Shutting down job manager...');
      await closeQueues();
      this.isInitialized = false;
      logger.info('Job manager shutdown successfully');
    } catch (error) {
      logger.error('Error during job manager shutdown', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get the initialization status
   */
  public getStatus(): boolean {
    return this.isInitialized;
  }

  /**
   * Trigger manual user sync
   */
  public async triggerUserSync(): Promise<void> {
    return triggerImmediateSync();
  }

  /**
   * Get user sync scheduler status
   */
  public async getUserSyncStatus() {
    return getUserSyncSchedulerStatus();
  }

  /**
   * Pause user sync scheduler
   */
  public async pauseUserSync(): Promise<void> {
    return pauseUserSyncScheduler();
  }

  /**
   * Resume user sync scheduler
   */
  public async resumeUserSync(): Promise<void> {
    return resumeUserSyncScheduler();
  }

  /**
   * Clean up old jobs
   */
  public async cleanupJobs(gracePeriodHours: number = 24): Promise<void> {
    return cleanupOldJobs(gracePeriodHours);
  }

  /**
   * Trigger manual project sync
   */
  public async triggerProjectSync(): Promise<void> {
    return triggerProjectImmediateSync();
  }

  /**
   * Get project sync scheduler status
   */
  public async getProjectSyncStatus() {
    return getProjectSyncSchedulerStatus();
  }

  /**
   * Pause project sync scheduler
   */
  public async pauseProjectSync(): Promise<void> {
    return pauseProjectSyncScheduler();
  }

  /**
   * Resume project sync scheduler
   */
  public async resumeProjectSync(): Promise<void> {
    return resumeProjectSyncScheduler();
  }

  /**
   * Clean up old project sync jobs
   */
  public async cleanupProjectJobs(gracePeriodHours: number = 24): Promise<void> {
    return cleanupProjectOldJobs(gracePeriodHours);
  }

  /**
   * Trigger manual issue sync
   */
  public async triggerIssueSync(): Promise<void> {
    return this.issueSyncScheduler?.triggerManual();
  }

  /**
   * Trigger manual merge request sync
   */
  public async triggerMergeRequestSync(): Promise<void> {
    return this.mergeRequestSyncScheduler?.triggerManual();
  }

  /**
   * Trigger manual namespace sync
   */
  public async triggerNamespaceSync(): Promise<void> {
    return this.namespaceSyncScheduler?.triggerManual();
  }
}

// Export singleton instance
export const jobManager = JobManager.getInstance();

// Export individual functions for convenience
export {
  triggerImmediateSync as triggerUserSync,
  getUserSyncSchedulerStatus,
  pauseUserSyncScheduler,
  resumeUserSyncScheduler,
  cleanupOldJobs,
  triggerProjectImmediateSync as triggerProjectSync,
  getProjectSyncSchedulerStatus,
  pauseProjectSyncScheduler,
  resumeProjectSyncScheduler,
  cleanupProjectOldJobs,
};
