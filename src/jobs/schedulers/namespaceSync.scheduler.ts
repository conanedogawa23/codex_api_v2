import { Queue } from 'bull';
import { logger } from '../../utils/logger';

export class NamespaceSyncScheduler {
  private queue: Queue;

  constructor(queue: Queue) {
    this.queue = queue;
  }

  /**
   * Schedule recurring namespace sync job
   * Every 1 hour (low priority - namespaces don't change often)
   */
  async scheduleRecurring(): Promise<void> {
    try {
      await this.queue.add(
        'namespace-sync',
        { batchSize: 200 },
        {
          repeat: {
            every: 60 * 60 * 1000, // 1 hour
          },
          jobId: 'namespace-sync-recurring',
          removeOnComplete: 10,
          removeOnFail: 50
        }
      );

      logger.info('Namespace sync job scheduled', { interval: '1 hour' });
    } catch (error) {
      logger.error('Failed to schedule namespace sync job', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async triggerManual(): Promise<void> {
    await this.queue.add('namespace-sync', { batchSize: 200 });
    logger.info('Manual namespace sync triggered');
  }
}

