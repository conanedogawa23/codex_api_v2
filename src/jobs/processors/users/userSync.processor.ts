import { Job } from 'bull';
import { User, IUser } from '../../../models/User';
import { logger } from '../../../utils/logger';
import { gitlabUserProcessor } from './gitlabUserProcessor';
import moment from 'moment-timezone';
import { Project } from '../../../models/Project';
import { Issue } from '../../../models/Issue';
import { MergeRequest } from '../../../models/MergeRequest';
import { Task } from '../../../models/Task';
import { Commit } from '../../../models/Commit';
import { Department } from '../../../models/Department';

export interface UserSyncJobData {
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
 */
export const processUserSync = async (job: Job<UserSyncJobData>): Promise<UserSyncResult> => {
  const startTime = Date.now();
  const { batchSize = 100 } = job.data;

  logger.info('Starting comprehensive user sync job with all data streams', {
    jobId: job.id,
    batchSize,
    dataStreams: 19
  });

  let usersProcessed = 0;
  let usersUpdated = 0;
  let errors = 0;

  try {
    const gitlabUsers = await gitlabUserProcessor.fetchSimpleUsers(batchSize);

    // Convert GitLab users to our expected format
    const usersToProcess = gitlabUsers.map((gitlabUser: any) => {
      // Extract numeric ID from GraphQL global ID format
      const idMatch = gitlabUser.id.match(/\d+$/);
      const numericId = idMatch ? parseInt(idMatch[0]) : parseInt(gitlabUser.id);
      
      return {
        gitlabId: numericId,
        username: gitlabUser.username,
        email: gitlabUser.email
      };
    });

    logger.info('Users to process from GitLab', {
      totalUsers: usersToProcess.length
    });

    if (usersToProcess.length === 0) {
      logger.info('No users to process');
      await job.progress(100);

      const duration = Date.now() - startTime;
      return {
        success: true,
        usersProcessed: 0,
        usersUpdated: 0,
        errors: 0,
        duration,
        timestamp: moment().format('YYYY-MM-DDTHH:mm:ss.SSS')
      };
    }

    // Update progress for preparation phase
    await job.progress(5);

    // Process users in batches
    const totalUsers = usersToProcess.length;

    for (let i = 0; i < usersToProcess.length; i += batchSize) {
      const batch = usersToProcess.slice(i, i + batchSize);
      const progress = Math.round(5 + ((i + batch.length) / totalUsers) * 95);
      await job.progress(progress);

      logger.debug('Processing user batch', {
        batchSize: batch.length,
        totalUsers
      });

      // Process each user in the batch
      for (const user of batch) {
        try {
          // Check if user exists in database by gitlabId
          const existingUser = await User.findOne({ gitlabId: user.gitlabId }).lean();

          if (existingUser) {
            // Fetch comprehensive data from GitLab (all 19 query streams)
            const gitlabUserDataRaw = await gitlabUserProcessor.fetchUserData([user.gitlabId]);

            if (gitlabUserDataRaw?.data?.users?.length > 0) {
              const gitlabData = gitlabUserDataRaw.data.users[0];

              // Prepare updates for User model - ALL VALIDATED FIELDS
              const userUpdates: Partial<IUser> = {
                lastSynced: moment().toDate()
              };

              if (gitlabData.name) userUpdates.name = gitlabData.name.trim();
              if (gitlabData.email) userUpdates.email = gitlabData.email.toLowerCase().trim();
              if (gitlabData.username) userUpdates.username = gitlabData.username.trim();
              if (gitlabData.avatarUrl) userUpdates.avatar = gitlabData.avatarUrl;
              if (gitlabData.publicEmail) userUpdates.publicEmail = gitlabData.publicEmail;
              if (gitlabData.webUrl) userUpdates.webUrl = gitlabData.webUrl;

              // Status mapping (from 'state' and 'active' fields)
              if (gitlabData.state === 'blocked' || gitlabData.active === false) {
                userUpdates.status = 'inactive';
                userUpdates.isActive = false;
              } else if (gitlabData.state === 'active' && gitlabData.active === true) {
                userUpdates.status = 'active';
                userUpdates.isActive = true;
              }

              // Activity count (groupCount is available)
              if (typeof gitlabData.groupCount === 'number') {
                userUpdates.groupCount = gitlabData.groupCount;
              }

              // Join date (only if not set)
              if (!existingUser.joinDate && gitlabData.createdAt) {
                userUpdates.joinDate = moment(gitlabData.createdAt).toDate();
              }

              if (gitlabData.bio) userUpdates.bio = gitlabData.bio;
              if (gitlabData.location) userUpdates.location = gitlabData.location;
              if (gitlabData.pronouns) userUpdates.pronouns = gitlabData.pronouns;
              if (gitlabData.organization) userUpdates.department = gitlabData.organization;
              if (gitlabData.jobTitle) userUpdates.role = gitlabData.jobTitle;
              if (gitlabData.linkedin) userUpdates.linkedin = gitlabData.linkedin;
              if (gitlabData.twitter) userUpdates.twitter = gitlabData.twitter;
              if (gitlabData.discord) userUpdates.discord = gitlabData.discord;

              // Role fallback
              if (!userUpdates.role) {
                userUpdates.role = existingUser.role || 'Developer';
              }

              if (gitlabData.projectMemberships?.length > 0) {
                const projectsData = gitlabData.projectMemberships
                  .filter((mem: any) => mem?.project?.id)
                  .map((mem: any) => ({
                    id: mem.project.id.toString(),
                    name: mem.project.name || 'Unknown',
                    role: mapAccessLevel(mem.accessLevel?.integerValue || 30)
                  }));
                
                if (projectsData.length > 0) {
                  userUpdates.projects = projectsData;
                  
                  // Also update assignedRepos from project memberships
                  userUpdates.assignedRepos = gitlabData.projectMemberships
                    .filter((mem: any) => mem?.project?.fullPath)
                    .map((mem: any) => mem.project.fullPath);
                }
              }

              const inferredSkills = new Set<string>();
              
              // Infer from job title
              if (gitlabData.jobTitle) {
                const jobKeywords = gitlabData.jobTitle.toLowerCase();
                if (jobKeywords.includes('frontend')) inferredSkills.add('Frontend');
                if (jobKeywords.includes('backend')) inferredSkills.add('Backend');
                if (jobKeywords.includes('fullstack') || jobKeywords.includes('full stack')) {
                  inferredSkills.add('Frontend');
                  inferredSkills.add('Backend');
                }
                if (jobKeywords.includes('devops')) inferredSkills.add('DevOps');
                if (jobKeywords.includes('senior')) inferredSkills.add('Leadership');
                if (jobKeywords.includes('lead') || jobKeywords.includes('manager')) {
                  inferredSkills.add('Management');
                }
              }

              // Infer from starred projects (if available)
              if (gitlabData.starredProjects?.length > 0) {
                gitlabData.starredProjects.slice(0, 10).forEach((proj: any) => {
                  if (proj.name) {
                    const projName = proj.name.toLowerCase();
                    if (projName.includes('react') || projName.includes('vue') || projName.includes('angular')) {
                      inferredSkills.add('Frontend');
                    }
                    if (projName.includes('node') || projName.includes('express') || projName.includes('api')) {
                      inferredSkills.add('Backend');
                    }
                    if (projName.includes('docker') || projName.includes('kubernetes')) {
                      inferredSkills.add('DevOps');
                    }
                  }
                });
              }

              // Convert Set to Array and limit to top 15 skills
              if (inferredSkills.size > 0) {
                userUpdates.skills = Array.from(inferredSkills).slice(0, 15);
              }

              // Update User
              const updatedUser = await User.findByIdAndUpdate(
                existingUser._id,
                { $set: userUpdates },
                { new: true }
              );

              if (!updatedUser) {
                logger.warn('User update failed', { gitlabId: user.gitlabId });
                continue;
              }

              usersUpdated++;

              logger.debug('User updated with comprehensive data from all streams', {
                userId: updatedUser._id,
                gitlabId: user.gitlabId,
                updatedFields: Object.keys(userUpdates).length - 1,
                hasProjectMemberships: !!gitlabData.projectMemberships?.length,
                hasMergeRequests: !!(gitlabData.authoredMergeRequests?.length || gitlabData.assignedMergeRequests?.length),
                hasSnippets: !!gitlabData.snippets?.length,
                hasTimelogs: !!gitlabData.timelogs?.length
              });

              const bulkOps: any[] = [];

              // Project: Update assignedTo
              bulkOps.push({
                updateMany: {
                  filter: { 'assignedTo.id': user.gitlabId.toString() },
                  update: {
                    $set: {
                      'assignedTo.$[elem].name': userUpdates.name || gitlabData.name,
                      'assignedTo.$[elem].department': userUpdates.department,
                      'assignedTo.$[elem].role': userUpdates.role || 'Developer'
                    }
                  },
                  arrayFilters: [{ 'elem.id': user.gitlabId.toString() }]
                }
              });

              // Issue: Update author and assignees
              bulkOps.push({
                updateMany: {
                  filter: { 'author.id': user.gitlabId },
                  update: {
                    $set: {
                      'author.name': userUpdates.name || gitlabData.name,
                      'author.username': userUpdates.username || gitlabData.username,
                      'author.email': userUpdates.email || gitlabData.email,
                      'author.avatarUrl': userUpdates.avatar || gitlabData.avatarUrl
                    }
                  }
                }
              });

              bulkOps.push({
                updateMany: {
                  filter: { 'assignees.id': user.gitlabId },
                  update: {
                    $set: {
                      'assignees.$[elem].name': userUpdates.name || gitlabData.name,
                      'assignees.$[elem].username': userUpdates.username || gitlabData.username,
                      'assignees.$[elem].email': userUpdates.email || gitlabData.email,
                      'assignees.$[elem].avatarUrl': userUpdates.avatar || gitlabData.avatarUrl
                    }
                  },
                  arrayFilters: [{ 'elem.id': user.gitlabId }]
                }
              });

              // MergeRequest: Update author, assignees, and reviewers
              bulkOps.push({
                updateMany: {
                  filter: { 'author.id': user.gitlabId },
                  update: {
                    $set: {
                      'author.name': userUpdates.name || gitlabData.name,
                      'author.username': userUpdates.username || gitlabData.username,
                      'author.email': userUpdates.email || gitlabData.email,
                      'author.avatarUrl': userUpdates.avatar || gitlabData.avatarUrl
                    }
                  }
                }
              });

              bulkOps.push({
                updateMany: {
                  filter: { 'assignees.id': user.gitlabId },
                  update: {
                    $set: {
                      'assignees.$[elem].name': userUpdates.name || gitlabData.name,
                      'assignees.$[elem].username': userUpdates.username || gitlabData.username,
                      'assignees.$[elem].email': userUpdates.email || gitlabData.email,
                      'assignees.$[elem].avatarUrl': userUpdates.avatar || gitlabData.avatarUrl
                    }
                  },
                  arrayFilters: [{ 'elem.id': user.gitlabId }]
                }
              });

              bulkOps.push({
                updateMany: {
                  filter: { 'reviewers.id': user.gitlabId },
                  update: {
                    $set: {
                      'reviewers.$[elem].name': userUpdates.name || gitlabData.name,
                      'reviewers.$[elem].username': userUpdates.username || gitlabData.username,
                      'reviewers.$[elem].email': userUpdates.email || gitlabData.email,
                      'reviewers.$[elem].avatarUrl': userUpdates.avatar || gitlabData.avatarUrl
                    }
                  },
                  arrayFilters: [{ 'elem.id': user.gitlabId }]
                }
              });

              // Task: Update assignedTo and assignedBy
              bulkOps.push({
                updateMany: {
                  filter: { 'assignedTo.id': user.gitlabId.toString() },
                  update: {
                    $set: {
                      'assignedTo.name': userUpdates.name || gitlabData.name,
                      'assignedTo.email': userUpdates.email || gitlabData.email
                    }
                  }
                }
              });

              bulkOps.push({
                updateMany: {
                  filter: { 'assignedBy.id': user.gitlabId.toString() },
                  update: {
                    $set: {
                      'assignedBy.name': userUpdates.name || gitlabData.name,
                      'assignedBy.email': userUpdates.email || gitlabData.email
                    }
                  }
                }
              });

              // Commit: Update author details
              bulkOps.push({
                updateMany: {
                  filter: { authorEmail: gitlabData.email },
                  update: {
                    $set: {
                      authorName: userUpdates.name || gitlabData.name,
                      userId: updatedUser._id
                    }
                  }
                }
              });

              // Department: Update head
              bulkOps.push({
                updateMany: {
                  filter: { 'head.id': user.gitlabId.toString() },
                  update: {
                    $set: {
                      'head.name': userUpdates.name || gitlabData.name,
                      'head.email': userUpdates.email || gitlabData.email
                    }
                  }
                }
              });

              // Execute distributed bulk writes
              try {
                const projectOps = [bulkOps[0]];
                const issueOps = [bulkOps[1], bulkOps[2]];
                const mergeRequestOps = [bulkOps[3], bulkOps[4], bulkOps[5]];
                const taskOps = [bulkOps[6], bulkOps[7]];
                const commitOps = [bulkOps[8]];
                const deptOps = [bulkOps[9]];

                // Execute each model's operations
                if (projectOps.length > 0) await Project.bulkWrite(projectOps);
                if (issueOps.length > 0) await Issue.bulkWrite(issueOps);
                if (mergeRequestOps.length > 0) await MergeRequest.bulkWrite(mergeRequestOps);
                if (taskOps.length > 0) await Task.bulkWrite(taskOps);
                if (commitOps.length > 0) await Commit.bulkWrite(commitOps);
                if (deptOps.length > 0) await Department.bulkWrite(deptOps);

                logger.debug('Related models updated', { 
                  userId: updatedUser._id, 
                  gitlabId: user.gitlabId 
                });
              } catch (bulkError: unknown) {
                logger.error('Bulk update error', { 
                  userId: updatedUser._id, 
                  error: bulkError instanceof Error ? bulkError.message : 'Unknown' 
                });
              }

            } else {
              logger.warn('No GitLab user data found for existing user', {
                userId: existingUser._id,
                gitlabId: user.gitlabId,
                username: user.username
              });
            }
          } else {
            // User doesn't exist in database
            logger.info('GitLab user not found in database, skipping sync', {
              gitlabId: user.gitlabId,
              username: user.username
            });
          }
        } catch (error: unknown) {
          errors++;
          logger.error('Error processing user', {
            gitlabId: user.gitlabId,
            username: user.username,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }

        usersProcessed++;
      }
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

    logger.info('User sync job completed successfully with all data streams', result);

    return result;
  } catch (error: unknown) {
    logger.error('User sync job failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      usersProcessed,
      usersUpdated,
      errors
    });

    throw error;
  }
};

// Helper function for access level mapping (GitLab access levels)
const mapAccessLevel = (accessLevel: number): string => {
  switch (accessLevel) {
    case 10: return 'Guest';
    case 20: return 'Reporter';
    case 30: return 'Developer';
    case 40: return 'Maintainer';
    case 50: return 'Owner';
    default: return 'Developer';
  }
};
