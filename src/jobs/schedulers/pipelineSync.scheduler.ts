import { Queue } from 'bull';
import { logger } from '../../utils/logger';

export class PipelineSyncScheduler {
  private queue: Queue;

  constructor(queue: Queue) {
    this.queue = queue;
  }

  /**
   * Schedule recurring pipeline sync job
   * Every 10 minutes (pipelines update frequently during development)
   */
  async scheduleRecurring(): Promise<void> {
    try {
      await this.queue.add(
        'pipeline-sync',
        { batchSize: 100 },
        {
          repeat: {
            every: 10 * 60 * 1000, // 10 minutes
          },
          jobId: 'pipeline-sync-recurring',
          removeOnComplete: 10,
          removeOnFail: 50
        }
      );

      logger.info('Pipeline sync job scheduled', { interval: '10 minutes' });
    } catch (error) {
      logger.error('Failed to schedule pipeline sync job', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async triggerManual(): Promise<void> {
    await this.queue.add('pipeline-sync', { batchSize: 100 });
    logger.info('Manual pipeline sync triggered');
  }
}
