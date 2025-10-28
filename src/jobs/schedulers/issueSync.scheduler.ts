import { Queue } from 'bull';
import { logger } from '../../utils/logger';

export class IssueSyncScheduler {
  private queue: Queue;

  constructor(queue: Queue) {
    this.queue = queue;
  }

  /**
   * Schedule recurring issue sync job
   * Every 15 minutes (high priority - issues change frequently)
   */
  async scheduleRecurring(): Promise<void> {
    try {
      await this.queue.add(
        'issue-sync',
        { batchSize: 100 },
        {
          repeat: {
            every: 15 * 60 * 1000, // 15 minutes
          },
          jobId: 'issue-sync-recurring',
          removeOnComplete: 10,
          removeOnFail: 50
        }
      );

      logger.info('Issue sync job scheduled', { interval: '15 minutes' });
    } catch (error) {
      logger.error('Failed to schedule issue sync job', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async triggerManual(): Promise<void> {
    await this.queue.add('issue-sync', { batchSize: 100 });
    logger.info('Manual issue sync triggered');
  }
}

