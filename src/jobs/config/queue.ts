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

// Queue event listeners for monitoring
userSyncQueue.on('error', (error: Error) => {
  logger.error('User sync queue error', { error: error.message });
});

userSyncQueue.on('waiting', (jobId: string) => {
  logger.debug('User sync job waiting', { jobId });
});

userSyncQueue.on('active', (job: Queue.Job) => {
  logger.info('User sync job started', { jobId: job.id, data: job.data });
});

userSyncQueue.on('completed', (job: Queue.Job, result: any) => {
  logger.info('User sync job completed', { 
    jobId: job.id, 
    result,
    duration: Date.now() - job.processedOn!
  });
});

userSyncQueue.on('failed', (job: Queue.Job, error: Error) => {
  logger.error('User sync job failed', { 
    jobId: job.id, 
    error: error.message,
    stack: error.stack 
  });
});

userSyncQueue.on('stalled', (job: Queue.Job) => {
  logger.warn('User sync job stalled', { jobId: job.id });
});

// Project sync queue event listeners
projectSyncQueue.on('error', (error: Error) => {
  logger.error('Project sync queue error', { error: error.message });
});

projectSyncQueue.on('waiting', (jobId: string) => {
  logger.debug('Project sync job waiting', { jobId });
});

projectSyncQueue.on('active', (job: Queue.Job) => {
  logger.info('Project sync job started', { jobId: job.id, data: job.data });
});

projectSyncQueue.on('completed', (job: Queue.Job, result: any) => {
  logger.info('Project sync job completed', { 
    jobId: job.id, 
    result,
    duration: Date.now() - job.processedOn!
  });
});

projectSyncQueue.on('failed', (job: Queue.Job, error: Error) => {
  logger.error('Project sync job failed', { 
    jobId: job.id, 
    error: error.message,
    stack: error.stack 
  });
});

projectSyncQueue.on('stalled', (job: Queue.Job) => {
  logger.warn('Project sync job stalled', { jobId: job.id });
});

// Issue sync queue event listeners
issueSyncQueue.on('error', (error: Error) => {
  logger.error('Issue sync queue error', { error: error.message });
});

issueSyncQueue.on('completed', (job: Queue.Job, result: any) => {
  logger.info('Issue sync job completed', { jobId: job.id, result });
});

issueSyncQueue.on('failed', (job: Queue.Job, error: Error) => {
  logger.error('Issue sync job failed', { jobId: job.id, error: error.message });
});

// Merge request sync queue event listeners
mergeRequestSyncQueue.on('error', (error: Error) => {
  logger.error('Merge request sync queue error', { error: error.message });
});

mergeRequestSyncQueue.on('completed', (job: Queue.Job, result: any) => {
  logger.info('Merge request sync job completed', { jobId: job.id, result });
});

mergeRequestSyncQueue.on('failed', (job: Queue.Job, error: Error) => {
  logger.error('Merge request sync job failed', { jobId: job.id, error: error.message });
});

// Namespace sync queue event listeners
namespaceSyncQueue.on('error', (error: Error) => {
  logger.error('Namespace sync queue error', { error: error.message });
});

namespaceSyncQueue.on('completed', (job: Queue.Job, result: any) => {
  logger.info('Namespace sync job completed', { jobId: job.id, result });
});

namespaceSyncQueue.on('failed', (job: Queue.Job, error: Error) => {
  logger.error('Namespace sync job failed', { jobId: job.id, error: error.message });
});

// Graceful shutdown
export const closeQueues = async (): Promise<void> => {
  logger.info('Closing job queues...');
  await userSyncQueue.close();
  await projectSyncQueue.close();
  await issueSyncQueue.close();
  await mergeRequestSyncQueue.close();
  await namespaceSyncQueue.close();
  await redisClient.quit();
  await subscriber.quit();
  logger.info('Job queues closed successfully');
};

export { redisClient, subscriber };
