import { Queue } from 'bull';
import { logger } from '../../utils/logger';

export class MergeRequestSyncScheduler {
  private queue: Queue;

  constructor(queue: Queue) {
    this.queue = queue;
  }

  /**
   * Schedule recurring merge request sync job
   * Every 15 minutes (high priority - MRs change frequently)
   */
  async scheduleRecurring(): Promise<void> {
    try {
      await this.queue.add(
        'merge-request-sync',
        { batchSize: 100 },
        {
          repeat: {
            every: 15 * 60 * 1000, // 15 minutes
          },
          jobId: 'merge-request-sync-recurring',
          removeOnComplete: 10,
          removeOnFail: 50
        }
      );

      logger.info('Merge request sync job scheduled', { interval: '15 minutes' });
    } catch (error) {
      logger.error('Failed to schedule merge request sync job', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async triggerManual(): Promise<void> {
    await this.queue.add('merge-request-sync', { batchSize: 100 });
    logger.info('Manual merge request sync triggered');
  }
}

