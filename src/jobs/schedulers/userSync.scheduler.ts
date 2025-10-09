import { userSyncQueue } from '../config/queue';
import { processUserSync, UserSyncJobData } from '../processors/users/userSync.processor';
import { logger } from '../../utils/logger';

/**
 * Initialize User Sync Job Scheduler
 * Sets up a repeatable job that runs every 20 minutes
 */
export const initializeUserSyncScheduler = async (): Promise<void> => {
  try {
    logger.info('Initializing user sync scheduler...');

    // Register the job processor
    userSyncQueue.process(processUserSync);

    // Remove any existing repeatable jobs to avoid duplicates
    const existingJobs = await userSyncQueue.getRepeatableJobs();
    for (const job of existingJobs) {
      await userSyncQueue.removeRepeatableByKey(job.key);
      logger.info('Removed existing repeatable job', { key: job.key });
    }

    // Schedule the job to run every 20 minutes
    const jobData: UserSyncJobData = {
      syncType: 'incremental',
      batchSize: 100
    };

    const job = await userSyncQueue.add(jobData, {
      repeat: {
        every: 20 * 60 * 1000, // 20 minutes in milliseconds
      },
      removeOnComplete: 10, // Keep last 10 completed jobs
      removeOnFail: 20, // Keep last 20 failed jobs for debugging
      attempts: 3, // Retry up to 3 times on failure
      backoff: {
        type: 'exponential',
        delay: 5000, // Start with 5 second delay
      },
    });

    logger.info('User sync scheduler initialized successfully', {
      jobId: job.id,
      repeatKey: job.opts.repeat?.key,
      interval: '20 minutes'
    });

    // Optionally, trigger an immediate sync on startup
    await triggerImmediateSync();

  } catch (error: any) {
    logger.error('Failed to initialize user sync scheduler', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
};

/**
 * Trigger an immediate user sync job (outside the schedule)
 */
export const triggerImmediateSync = async (syncType: 'full' | 'incremental' = 'incremental'): Promise<void> => {
  try {
    const jobData: UserSyncJobData = {
      syncType,
      batchSize: 100
    };

    const job = await userSyncQueue.add(jobData, {
      priority: 1, // High priority for immediate sync
      removeOnComplete: true,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
    });

    logger.info('Immediate user sync triggered', {
      jobId: job.id,
      syncType
    });
  } catch (error: any) {
    logger.error('Failed to trigger immediate sync', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
};

/**
 * Get status of the user sync scheduler
 */
export const getUserSyncSchedulerStatus = async () => {
  try {
    const repeatableJobs = await userSyncQueue.getRepeatableJobs();
    const activeJobs = await userSyncQueue.getActive();
    const waitingJobs = await userSyncQueue.getWaiting();
    const completedJobs = await userSyncQueue.getCompleted();
    const failedJobs = await userSyncQueue.getFailed();

    return {
      repeatableJobs: repeatableJobs.map(job => ({
        name: job.name,
        key: job.key,
        cron: job.cron,
        every: job.every,
        next: job.next,
      })),
      counts: {
        active: activeJobs.length,
        waiting: waitingJobs.length,
        completed: completedJobs.length,
        failed: failedJobs.length,
      },
      activeJobs: activeJobs.map(job => ({
        id: job.id,
        data: job.data,
        progress: job.progress(),
        processedOn: job.processedOn,
      })),
    };
  } catch (error: any) {
    logger.error('Failed to get scheduler status', {
      error: error.message
    });
    throw error;
  }
};

/**
 * Pause the user sync scheduler
 */
export const pauseUserSyncScheduler = async (): Promise<void> => {
  try {
    await userSyncQueue.pause();
    logger.info('User sync scheduler paused');
  } catch (error: any) {
    logger.error('Failed to pause scheduler', {
      error: error.message
    });
    throw error;
  }
};

/**
 * Resume the user sync scheduler
 */
export const resumeUserSyncScheduler = async (): Promise<void> => {
  try {
    await userSyncQueue.resume();
    logger.info('User sync scheduler resumed');
  } catch (error: any) {
    logger.error('Failed to resume scheduler', {
      error: error.message
    });
    throw error;
  }
};

/**
 * Clean up old jobs
 */
export const cleanupOldJobs = async (gracePeriodHours: number = 24): Promise<void> => {
  try {
    const gracePeriodMs = gracePeriodHours * 60 * 60 * 1000;
    
    await userSyncQueue.clean(gracePeriodMs, 'completed');
    await userSyncQueue.clean(gracePeriodMs, 'failed');
    
    logger.info('Old jobs cleaned up', { gracePeriodHours });
  } catch (error: any) {
    logger.error('Failed to cleanup old jobs', {
      error: error.message
    });
    throw error;
  }
};
