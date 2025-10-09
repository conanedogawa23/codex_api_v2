import { Job } from 'bull';
import { User } from '../../../models/User';
import { logger } from '../../../utils/logger';
import { gitlabUserProcessor } from './gitlabUserProcessor';
import moment from 'moment-timezone';

export interface UserSyncJobData {
  syncType: 'full' | 'incremental';
  batchSize?: number;
}

export interface UserSyncResult {
  success: boolean;
  usersProcessed: number;
  usersUpdated: number;
  errors: number;
  duration: number;
  timestamp: string;
}

/**
 * User Sync Job Processor
 * Fetches users from database and updates their lastSynced timestamp
 * This simulates calling GraphQL endpoints and updating records
 */
export const processUserSync = async (job: Job<UserSyncJobData>): Promise<UserSyncResult> => {
  const startTime = Date.now();
  const { syncType = 'incremental', batchSize = 100 } = job.data;

  logger.info('Starting user sync job', { 
    jobId: job.id, 
    syncType, 
    batchSize 
  });

  let usersProcessed = 0;
  let usersUpdated = 0;
  let errors = 0;

  try {
    // Build query filter based on sync type
    const filter: Record<string, unknown> = {};
    
    if (syncType === 'incremental') {
      // Only sync users not updated in the last 20 minutes
      const twentyMinutesAgo = moment().subtract(20, 'minutes').toDate();
      filter.lastSynced = { $lt: twentyMinutesAgo };
    }

    // Fetch users in batches
    const totalUsers = await User.countDocuments(filter);
    logger.info('Users to sync', { totalUsers, filter });

    let skip = 0;
    
    while (skip < totalUsers) {
      // Update progress
      const progress = Math.round((skip / totalUsers) * 100);
      await job.progress(progress);

      // Fetch batch of users
      const users = await User.find(filter)
        .limit(batchSize)
        .skip(skip)
        .select('_id username email gitlabId lastSynced')
        .lean();

      logger.debug('Processing user batch', { 
        batchSize: users.length, 
        skip, 
        totalUsers 
      });

      // Process each user in the batch
      for (const user of users) {
        try {
          // Check if user has GitLab ID for sync
          if (user.gitlabId === undefined) {
            logger.warn('User missing gitlabId', {
              userId: user._id,
              username: user.username
            });
            continue;
          }

          // Fetch comprehensive user data from GitLab
          const gitlabUserData = await gitlabUserProcessor.fetchUserData([user.gitlabId]);

          if (gitlabUserData?.data?.users?.length > 0) {
            // Update user's lastSynced timestamp
            await User.findByIdAndUpdate(
              user._id,
              {
                lastSynced: moment().toDate(),
                updatedAt: moment().toDate()
              },
              { new: true }
            );

            usersUpdated++;

            logger.debug('User synced successfully', {
              userId: user._id,
              username: user.username,
              gitlabId: user.gitlabId
            });
          } else {
            logger.warn('No GitLab user data found', {
              userId: user._id,
              username: (user as any).username,
              gitlabId: user.gitlabId
            });
          }
        } catch (error: unknown) {
          errors++;
          logger.error('Error syncing user', {
            userId: user._id,
            username: user.username,
            gitlabId: user.gitlabId,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }

        usersProcessed++;
      }

      skip += batchSize;
    }

    // Mark job as 100% complete
    await job.progress(100);

    const duration = Date.now() - startTime;
    const result: UserSyncResult = {
      success: true,
      usersProcessed,
      usersUpdated,
      errors,
      duration,
      timestamp: moment().format('YYYY-MM-DDTHH:mm:ss.SSS')
    };

    logger.info('User sync job completed successfully', result);
    
    return result;
  } catch (error: unknown) {
    logger.error('User sync job failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      usersProcessed,
      usersUpdated,
      errors
    });

    throw error; // Re-throw to mark job as failed
  }
};
