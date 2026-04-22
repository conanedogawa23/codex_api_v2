import { logger } from '../utils/logger';
import {
  budgetSpentQueue,
  closeQueues,
  commitSyncQueue,
  eventSyncQueue,
  issueSyncQueue,
  iterationSyncQueue,
  labelSyncQueue,
  mergeRequestSyncQueue,
  milestoneSyncQueue,
  namespaceSyncQueue,
  pipelineSyncQueue,
  projectSyncQueue,
  userSyncQueue,
} from './config/queue';
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
import { PipelineSyncScheduler } from './schedulers/pipelineSync.scheduler';
import { processCommitSync, type CommitSyncJobData } from './processors/commits/commitSync.processor';
import { processEventSync } from './processors/events/eventSync.processor';
import { processIssueSync } from './processors/issues/issueSync.processor';
import { processIterationSync, type IterationSyncJobData } from './processors/iterations/iterationSync.processor';
import { processLabelSync, type LabelSyncJobData } from './processors/labels/labelSync.processor';
import { processMilestoneSync, type MilestoneSyncJobData } from './processors/milestones/milestoneSync.processor';
import { processMergeRequestSync } from './processors/mergeRequests/mergeRequestSync.processor';
import { processNamespaceSync } from './processors/namespaces/namespaceSync.processor';
import { processPipelineSync } from './processors/pipelines/pipelineSync.processor';
import { processBudgetSpent } from './processors/budgetSpent/budgetSpent.processor';

type NamedSyncJobConfig = {
  queue: any;
  jobName: string;
  label: string;
  intervalMs: number;
  defaultData: Record<string, unknown>;
  processor: any;
};

export interface JobInitializationOptions {
  scheduleRecurring?: boolean;
  triggerImmediateSyncs?: boolean;
  clearPendingJobs?: boolean;
}

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
  private pipelineSyncScheduler?: PipelineSyncScheduler;

  private constructor() {}

  private async removeRepeatableJobs(queue: any, label: string): Promise<void> {
    const repeatableJobs = await queue.getRepeatableJobs();

    for (const job of repeatableJobs) {
      await queue.removeRepeatableByKey(job.key);
      logger.info(`Removed existing repeatable ${label} sync job`, { key: job.key });
    }
  }

  private async clearPendingJobs(queue: any, label: string): Promise<void> {
    const [waitingJobs, delayedJobs] = await Promise.all([
      queue.getWaiting(),
      queue.getDelayed(),
    ]);

    for (const job of [...waitingJobs, ...delayedJobs]) {
      await job.remove();
    }

    logger.info(`Cleared pending ${label} sync jobs`, {
      waiting: waitingJobs.length,
      delayed: delayedJobs.length,
    });
  }

  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error('Background jobs are not initialized');
    }
  }

  private async initializeNamedRecurringSync({
    queue,
    jobName,
    label,
    intervalMs,
    defaultData,
    processor,
  }: NamedSyncJobConfig, options: JobInitializationOptions): Promise<void> {
    const { scheduleRecurring = true, clearPendingJobs = false } = options;

    queue.process(jobName, processor);

    await this.removeRepeatableJobs(queue, label);
    if (clearPendingJobs) {
      await this.clearPendingJobs(queue, label);
    }

    if (scheduleRecurring) {
      await queue.add(jobName, defaultData, {
        repeat: {
          every: intervalMs,
        },
        jobId: `${jobName}-recurring`,
        removeOnComplete: 10,
        removeOnFail: 50,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      });

      logger.info(`${label} sync scheduler initialized`, {
        interval: `${intervalMs / (60 * 1000)} minutes`,
        jobName,
      });
      return;
    }

    logger.info(`${label} sync processor initialized without recurring schedule`, {
      jobName,
    });
  }

  private async enqueueNamedSyncJob(
    queue: any,
    jobName: string,
    label: string,
    data: Record<string, unknown>
  ): Promise<void> {
    this.ensureInitialized();

    await queue.add(jobName, data, {
      priority: 1,
      removeOnComplete: true,
      removeOnFail: 20,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
    });

    logger.info(`Manual ${label} sync triggered`, data);
  }

  public static getInstance(): JobManager {
    if (!JobManager.instance) {
      JobManager.instance = new JobManager();
    }
    return JobManager.instance;
  }

  /**
   * Initialize all job schedulers
   */
  public async initialize(options: JobInitializationOptions = {}): Promise<void> {
    const {
      scheduleRecurring = true,
      triggerImmediateSyncs = true,
      clearPendingJobs = false,
    } = options;

    if (this.isInitialized) {
      logger.warn('Job manager already initialized');
      return;
    }

    try {
      logger.info('Initializing job manager...');

      // Initialize user sync scheduler
      if (clearPendingJobs) {
        await this.clearPendingJobs(userSyncQueue, 'user');
      }
      await initializeUserSyncScheduler({
        scheduleRecurring,
        triggerImmediateSync: triggerImmediateSyncs,
      });

      // Initialize project sync scheduler
      if (clearPendingJobs) {
        await this.clearPendingJobs(projectSyncQueue, 'project');
      }
      await initializeProjectSyncScheduler({
        scheduleRecurring,
        triggerImmediateSync: triggerImmediateSyncs,
      });

      // Initialize issue sync scheduler
      this.issueSyncScheduler = new IssueSyncScheduler(issueSyncQueue);
      issueSyncQueue.process('issue-sync', processIssueSync);
      await this.removeRepeatableJobs(issueSyncQueue, 'issue');
      if (clearPendingJobs) {
        await this.clearPendingJobs(issueSyncQueue, 'issue');
      }
      if (scheduleRecurring) {
        await this.issueSyncScheduler.scheduleRecurring();
        logger.info('Issue sync scheduler initialized');
      } else {
        logger.info('Issue sync scheduler initialized without recurring schedule');
      }

      // Initialize merge request sync scheduler
      this.mergeRequestSyncScheduler = new MergeRequestSyncScheduler(mergeRequestSyncQueue);
      mergeRequestSyncQueue.process('merge-request-sync', processMergeRequestSync);
      await this.removeRepeatableJobs(mergeRequestSyncQueue, 'merge request');
      if (clearPendingJobs) {
        await this.clearPendingJobs(mergeRequestSyncQueue, 'merge request');
      }
      if (scheduleRecurring) {
        await this.mergeRequestSyncScheduler.scheduleRecurring();
        logger.info('Merge request sync scheduler initialized');
      } else {
        logger.info('Merge request sync scheduler initialized without recurring schedule');
      }

      // Initialize namespace sync scheduler
      this.namespaceSyncScheduler = new NamespaceSyncScheduler(namespaceSyncQueue);
      namespaceSyncQueue.process('namespace-sync', processNamespaceSync);
      await this.removeRepeatableJobs(namespaceSyncQueue, 'namespace');
      if (clearPendingJobs) {
        await this.clearPendingJobs(namespaceSyncQueue, 'namespace');
      }
      if (scheduleRecurring) {
        await this.namespaceSyncScheduler.scheduleRecurring();
        logger.info('Namespace sync scheduler initialized');
      } else {
        logger.info('Namespace sync scheduler initialized without recurring schedule');
      }

      // Initialize pipeline sync scheduler
      this.pipelineSyncScheduler = new PipelineSyncScheduler(pipelineSyncQueue);
      pipelineSyncQueue.process('pipeline-sync', processPipelineSync);
      await this.removeRepeatableJobs(pipelineSyncQueue, 'pipeline');
      if (clearPendingJobs) {
        await this.clearPendingJobs(pipelineSyncQueue, 'pipeline');
      }
      if (scheduleRecurring) {
        await this.pipelineSyncScheduler.scheduleRecurring();
        logger.info('Pipeline sync scheduler initialized');
      } else {
        logger.info('Pipeline sync scheduler initialized without recurring schedule');
      }

      await this.initializeNamedRecurringSync({
        queue: commitSyncQueue,
        jobName: 'commit-sync',
        label: 'Commit',
        intervalMs: 10 * 60 * 1000,
        defaultData: { batchSize: 100 },
        processor: processCommitSync,
      }, options);

      await this.initializeNamedRecurringSync({
        queue: labelSyncQueue,
        jobName: 'label-sync',
        label: 'Label',
        intervalMs: 60 * 60 * 1000,
        defaultData: { batchSize: 200 },
        processor: processLabelSync,
      }, options);

      await this.initializeNamedRecurringSync({
        queue: milestoneSyncQueue,
        jobName: 'milestone-sync',
        label: 'Milestone',
        intervalMs: 60 * 60 * 1000,
        defaultData: { batchSize: 100 },
        processor: processMilestoneSync,
      }, options);

      await this.initializeNamedRecurringSync({
        queue: iterationSyncQueue,
        jobName: 'iteration-sync',
        label: 'Iteration',
        intervalMs: 60 * 60 * 1000,
        defaultData: { batchSize: 100 },
        processor: processIterationSync,
      }, options);

      await this.initializeNamedRecurringSync({
        queue: eventSyncQueue,
        jobName: 'event-sync',
        label: 'Event',
        intervalMs: 15 * 60 * 1000,
        defaultData: { batchSize: 100 },
        processor: processEventSync,
      }, options);

      await this.initializeNamedRecurringSync({
        queue: budgetSpentQueue,
        jobName: 'budget-spent-recalc',
        label: 'Budget spent',
        intervalMs: 20 * 60 * 1000,
        defaultData: { projectIds: [] },
        processor: processBudgetSpent,
      }, options);

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
   * Initialize ONLY merge request sync scheduler (selective initialization)
   */
  public async initializeMergeRequestSyncOnly(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('Job manager already initialized');
      return;
    }

    try {
      logger.info('Initializing merge request sync job only...');

      // Initialize ONLY merge request sync scheduler
      this.mergeRequestSyncScheduler = new MergeRequestSyncScheduler(mergeRequestSyncQueue);
      
      // Register processor with explicit job name
      mergeRequestSyncQueue.process('merge-request-sync', processMergeRequestSync);
      logger.info('Merge request processor registered');
      
      await this.mergeRequestSyncScheduler.scheduleRecurring();
      logger.info('Merge request sync scheduler initialized');

      this.isInitialized = true;
      logger.info('Merge request sync job initialized successfully (other jobs disabled)');
    } catch (error) {
      logger.error('Failed to initialize merge request sync job', {
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
    this.ensureInitialized();
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
    this.ensureInitialized();
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
  public async triggerIssueSync(data: Record<string, unknown> = { batchSize: 100 }): Promise<void> {
    return this.enqueueNamedSyncJob(issueSyncQueue, 'issue-sync', 'issue', {
      batchSize: 100,
      ...data,
    });
  }

  /**
   * Trigger manual merge request sync
   */
  public async triggerMergeRequestSync(
    data: Record<string, unknown> = { batchSize: 100 }
  ): Promise<void> {
    return this.enqueueNamedSyncJob(mergeRequestSyncQueue, 'merge-request-sync', 'merge request', {
      batchSize: 100,
      ...data,
    });
  }

  /**
   * Trigger manual namespace sync
   */
  public async triggerNamespaceSync(data: Record<string, unknown> = { batchSize: 100 }): Promise<void> {
    return this.enqueueNamedSyncJob(namespaceSyncQueue, 'namespace-sync', 'namespace', {
      batchSize: 100,
      ...data,
    });
  }

  /**
   * Trigger manual pipeline sync
   */
  public async triggerPipelineSync(data: Record<string, unknown> = { batchSize: 100 }): Promise<void> {
    return this.enqueueNamedSyncJob(pipelineSyncQueue, 'pipeline-sync', 'pipeline', {
      batchSize: 100,
      ...data,
    });
  }

  /**
   * Trigger manual commit sync
   */
  public async triggerCommitSync(data: CommitSyncJobData = { batchSize: 100 }): Promise<void> {
    return this.enqueueNamedSyncJob(commitSyncQueue, 'commit-sync', 'commit', {
      batchSize: 100,
      ...data,
    });
  }

  /**
   * Trigger manual label sync
   */
  public async triggerLabelSync(data: LabelSyncJobData = { batchSize: 200 }): Promise<void> {
    return this.enqueueNamedSyncJob(labelSyncQueue, 'label-sync', 'label', {
      batchSize: 200,
      ...data,
    });
  }

  /**
   * Trigger manual milestone sync
   */
  public async triggerMilestoneSync(data: MilestoneSyncJobData = { batchSize: 100 }): Promise<void> {
    return this.enqueueNamedSyncJob(milestoneSyncQueue, 'milestone-sync', 'milestone', {
      batchSize: 100,
      ...data,
    });
  }

  /**
   * Trigger manual iteration sync
   */
  public async triggerIterationSync(data: IterationSyncJobData = { batchSize: 100 }): Promise<void> {
    return this.enqueueNamedSyncJob(iterationSyncQueue, 'iteration-sync', 'iteration', {
      batchSize: 100,
      ...data,
    });
  }

  /**
   * Trigger manual event sync
   */
  public async triggerEventSync(data: Record<string, unknown> = { batchSize: 100 }): Promise<void> {
    return this.enqueueNamedSyncJob(eventSyncQueue, 'event-sync', 'event', {
      batchSize: 100,
      ...data,
    });
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
