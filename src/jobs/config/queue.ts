import Queue from 'bull';
import Redis from 'ioredis';
import { environment } from '../../config/environment';
import { logger } from '../../utils/logger';

const redisConfig = environment.get().redis;

// Create Redis client with ioredis
const redisClient = new Redis({
  host: redisConfig.host,
  port: redisConfig.port,
  password: redisConfig.password,
  db: redisConfig.db,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy(times: number) {
    const delay = Math.min(times * 50, 2000);
    logger.warn(`Redis connection retry attempt ${times}, waiting ${delay}ms`);
    return delay;
  },
});

// Redis connection event handlers
redisClient.on('connect', () => {
  logger.info('Redis client connected successfully');
});

redisClient.on('error', (error: Error) => {
  logger.error('Redis client error', { error: error.message });
});

redisClient.on('ready', () => {
  logger.info('Redis client is ready');
});

// Create a subscriber client for Bull
const subscriber = redisClient.duplicate();

// Queue configuration options
export const queueOptions = {
  createClient: (type: string) => {
    switch (type) {
      case 'client':
        return redisClient;
      case 'subscriber':
        return subscriber;
      default:
        return redisClient.duplicate();
    }
  },
};

// Create job queues
export const userSyncQueue = new Queue('user-sync', queueOptions);
export const projectSyncQueue = new Queue('project-sync', queueOptions);
export const issueSyncQueue = new Queue('issue-sync', queueOptions);
export const mergeRequestSyncQueue = new Queue('merge-request-sync', queueOptions);
export const namespaceSyncQueue = new Queue('namespace-sync', queueOptions);
export const pipelineSyncQueue = new Queue('pipeline-sync', queueOptions);
export const commitSyncQueue = new Queue('commit-sync', queueOptions);
export const labelSyncQueue = new Queue('label-sync', queueOptions);
export const milestoneSyncQueue = new Queue('milestone-sync', queueOptions);
export const iterationSyncQueue = new Queue('iteration-sync', queueOptions);
export const eventSyncQueue = new Queue('event-sync', queueOptions);
export const budgetSpentQueue = new Queue('budget-spent', queueOptions);

function registerQueueListeners(queue: any, label: string): void {
  queue.on('error', (error: Error) => {
    logger.error(`${label} sync queue error`, { error: error.message });
  });

  queue.on('waiting', (jobId: string) => {
    logger.debug(`${label} sync job waiting`, { jobId });
  });

  queue.on('active', (job: Queue.Job) => {
    logger.info(`${label} sync job started`, { jobId: job.id, data: job.data });
  });

  queue.on('completed', (job: Queue.Job, result: any) => {
    const duration =
      typeof job.processedOn === 'number' ? Date.now() - job.processedOn : undefined;

    logger.info(`${label} sync job completed`, {
      jobId: job.id,
      result,
      duration,
    });
  });

  queue.on('failed', (job: Queue.Job, error: Error) => {
    logger.error(`${label} sync job failed`, {
      jobId: job.id,
      error: error.message,
      stack: error.stack,
    });
  });

  queue.on('stalled', (job: Queue.Job) => {
    logger.warn(`${label} sync job stalled`, { jobId: job.id });
  });
}

for (const [queue, label] of [
  [userSyncQueue, 'User'],
  [projectSyncQueue, 'Project'],
  [issueSyncQueue, 'Issue'],
  [mergeRequestSyncQueue, 'Merge request'],
  [namespaceSyncQueue, 'Namespace'],
  [pipelineSyncQueue, 'Pipeline'],
  [commitSyncQueue, 'Commit'],
  [labelSyncQueue, 'Label'],
  [milestoneSyncQueue, 'Milestone'],
  [iterationSyncQueue, 'Iteration'],
  [eventSyncQueue, 'Event'],
  [budgetSpentQueue, 'Budget spent'],
] as Array<[any, string]>) {
  registerQueueListeners(queue, label);
}

// Graceful shutdown
export const closeQueues = async (): Promise<void> => {
  logger.info('Closing job queues...');
  await userSyncQueue.close();
  await projectSyncQueue.close();
  await issueSyncQueue.close();
  await mergeRequestSyncQueue.close();
  await namespaceSyncQueue.close();
  await pipelineSyncQueue.close();
  await commitSyncQueue.close();
  await labelSyncQueue.close();
  await milestoneSyncQueue.close();
  await iterationSyncQueue.close();
  await eventSyncQueue.close();
  await budgetSpentQueue.close();
  await redisClient.quit();
  await subscriber.quit();
  logger.info('Job queues closed successfully');
};

export { redisClient, subscriber };
