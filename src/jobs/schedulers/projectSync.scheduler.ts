import { projectSyncQueue } from '../config/queue';
import { processProjectSync, ProjectSyncJobData } from '../processors/projects/projectSync.processor';
import { logger } from '../../utils/logger';

/**
 * Initialize Project Sync Job Scheduler
 * Sets up a repeatable job that runs every 30 minutes (medium priority sync)
 */
export const initializeProjectSyncScheduler = async (): Promise<void> => {
  try {
    logger.info('Initializing project sync scheduler...');

    // Register the job processor
    projectSyncQueue.process(processProjectSync);

    // Remove any existing repeatable jobs to avoid duplicates
    const existingJobs = await projectSyncQueue.getRepeatableJobs();
    for (const job of existingJobs) {
      await projectSyncQueue.removeRepeatableByKey(job.key);
      logger.info('Removed existing repeatable project sync job', { key: job.key });
    }

    // Schedule the job to run every 30 minutes
    const jobData: ProjectSyncJobData = {
      batchSize: 100
    };

    const job = await projectSyncQueue.add(jobData, {
      repeat: {
        every: 30 * 60 * 1000, // 30 minutes in milliseconds
      },
      removeOnComplete: 10, // Keep last 10 completed jobs
      removeOnFail: 20, // Keep last 20 failed jobs for debugging
      attempts: 3, // Retry up to 3 times on failure
      backoff: {
        type: 'exponential',
        delay: 5000, // Start with 5 second delay
      },
    });

    logger.info('Project sync scheduler initialized successfully', {
      jobId: job.id,
      repeatKey: job.opts.repeat?.key,
      interval: '30 minutes'
    });

    // Optionally, trigger an immediate sync on startup
    await triggerImmediateSync();

  } catch (error: unknown) {
    logger.error('Failed to initialize project sync scheduler', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    throw error;
  }
};

/**
 * Trigger an immediate project sync job (outside the schedule)
 */
export const triggerImmediateSync = async (): Promise<void> => {
  try {
    const jobData: ProjectSyncJobData = {
      batchSize: 100
    };

    const job = await projectSyncQueue.add(jobData, {
      priority: 1, // High priority for immediate sync
      removeOnComplete: true,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
    });

    logger.info('Immediate project sync triggered', {
      jobId: job.id
    });
  } catch (error: unknown) {
    logger.error('Failed to trigger immediate project sync', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    throw error;
  }
};

/**
 * Get status of the project sync scheduler
 */
export const getProjectSyncSchedulerStatus = async () => {
  try {
    const repeatableJobs = await projectSyncQueue.getRepeatableJobs();
    const activeJobs = await projectSyncQueue.getActive();
    const waitingJobs = await projectSyncQueue.getWaiting();
    const completedJobs = await projectSyncQueue.getCompleted();
    const failedJobs = await projectSyncQueue.getFailed();

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
  } catch (error: unknown) {
    logger.error('Failed to get project sync scheduler status', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
};

/**
 * Pause the project sync scheduler
 */
export const pauseProjectSyncScheduler = async (): Promise<void> => {
  try {
    await projectSyncQueue.pause();
    logger.info('Project sync scheduler paused');
  } catch (error: unknown) {
    logger.error('Failed to pause project sync scheduler', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
};

/**
 * Resume the project sync scheduler
 */
export const resumeProjectSyncScheduler = async (): Promise<void> => {
  try {
    await projectSyncQueue.resume();
    logger.info('Project sync scheduler resumed');
  } catch (error: unknown) {
    logger.error('Failed to resume project sync scheduler', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
};

/**
 * Clean up old project sync jobs
 */
export const cleanupOldJobs = async (gracePeriodHours: number = 24): Promise<void> => {
  try {
    const gracePeriodMs = gracePeriodHours * 60 * 60 * 1000;
    
    await projectSyncQueue.clean(gracePeriodMs, 'completed');
    await projectSyncQueue.clean(gracePeriodMs, 'failed');
    
    logger.info('Old project sync jobs cleaned up', { gracePeriodHours });
  } catch (error: unknown) {
    logger.error('Failed to cleanup old project sync jobs', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
};

