import { logger } from '../utils/logger';
import { closeQueues } from './config/queue';
import {
  initializeUserSyncScheduler,
  triggerImmediateSync,
  getUserSyncSchedulerStatus,
  pauseUserSyncScheduler,
  resumeUserSyncScheduler,
  cleanupOldJobs,
} from './schedulers/userSync.scheduler';

/**
 * Job Manager
 * Centralized management for all background jobs
 */
export class JobManager {
  private static instance: JobManager;
  private isInitialized: boolean = false;

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

      // Add more schedulers here as needed
      // await initializeProjectSyncScheduler();
      // await initializeIssueSyncScheduler();

      this.isInitialized = true;
      logger.info('Job manager initialized successfully');
    } catch (error: any) {
      logger.error('Failed to initialize job manager', {
        error: error.message,
        stack: error.stack,
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
    } catch (error: any) {
      logger.error('Error during job manager shutdown', {
        error: error.message,
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
};
