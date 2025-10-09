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
 * Fetches users directly from GitLab and updates their lastSynced timestamp in database
 * This fetches users from GitLab GraphQL API and syncs with local database
 */
export const processUserSync = async (job: Job<UserSyncJobData>): Promise<UserSyncResult> => {
  const startTime = Date.now();
  const { batchSize = 100 } = job.data;

  logger.info('Starting user sync job (GitLab-based)', {
    jobId: job.id,
    batchSize
  });

  let usersProcessed = 0;
  let usersUpdated = 0;
  let errors = 0;

  try {
    // Always fetch users from GitLab to get gitlabIds directly from source
    logger.info('Fetching users from GitLab to get gitlabIds');
    const gitlabUsers = await gitlabUserProcessor.fetchSimpleUsers(batchSize);

    // Convert GitLab users to our expected format with proper gitlabIds
    const usersToProcess = gitlabUsers.map((gitlabUser: any) => ({
      gitlabId: parseInt(gitlabUser.id), // GitLab IDs are strings but we store as numbers
      username: gitlabUser.username,
      email: gitlabUser.email
    }));

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
            // Fetch comprehensive data from GitLab
            const gitlabUserDataRaw = await gitlabUserProcessor.fetchUserData([user.gitlabId]);

            if (gitlabUserDataRaw?.data?.users?.length > 0) {
              const gitlabData = gitlabUserDataRaw.data.users[0];

              // Prepare updates for User model
              const userUpdates: Partial<IUser> = {
                lastSynced: moment().toDate()
              };

              // Core fields with fallbacks
              if (gitlabData.name) userUpdates.name = gitlabData.name.trim();
              if (gitlabData.email) userUpdates.email = gitlabData.email.toLowerCase().trim();
              if (gitlabData.username) userUpdates.username = gitlabData.username.trim();
              if (gitlabData.avatarUrl) userUpdates.avatar = gitlabData.avatarUrl;

              // Status mapping
              const isLocked = gitlabData.isLocked || false;
              userUpdates.status = isLocked ? 'inactive' : 'active';

              // Department
              userUpdates.department = gitlabData.department || gitlabData.organization || existingUser.department;

              // Role
              userUpdates.role = gitlabData.jobTitle || existingUser.role || 'Developer';

              // Join date (only if not set)
              if (!existingUser.joinDate && gitlabData.createdAt) {
                userUpdates.joinDate = moment(gitlabData.createdAt).toDate();
              }

              // isActive
              userUpdates.isActive = !isLocked;

              // assignedRepos array (from authorizedProjects)
              if (gitlabData.authorizedProjects?.nodes) {
                userUpdates.assignedRepos = gitlabData.authorizedProjects.nodes
                  .filter((proj: any) => proj.permissions?.readProject) // Filter by read permission
                  .map((proj: any) => proj.fullPath); // Use fullPath, not pathWithNamespace
              }

              // projects array
              if (gitlabData.projectMemberships?.nodes) {
                const projectsData = gitlabData.projectMemberships.nodes.map((mem: any) => ({
                  id: mem.project.id.toString(),
                  name: mem.project.name,
                  role: mapAccessLevel(mem.accessLevel)
                }));
                userUpdates.projects = projectsData;
              }

              // skills array (inferred from GitLab activity)
              const inferredSkills = new Set<string>();
              
              // Add skills from starred projects (interests/expertise)
              if (gitlabData.starredProjects?.nodes) {
                gitlabData.starredProjects.nodes.forEach((proj: any) => {
                  if (proj.topics && Array.isArray(proj.topics)) {
                    proj.topics.forEach((topic: string) => inferredSkills.add(topic));
                  }
                });
              }
              
              // Add skills from authored snippets (language expertise)
              if (gitlabData.snippets?.nodes) {
                gitlabData.snippets.nodes.forEach((snippet: any) => {
                  if (snippet.language) {
                    inferredSkills.add(snippet.language);
                  }
                });
              }

              // Add skills from project memberships (current tech stack)
              if (gitlabData.projectMemberships?.nodes) {
                gitlabData.projectMemberships.nodes.forEach((mem: any) => {
                  if (mem.project?.topics && Array.isArray(mem.project.topics)) {
                    mem.project.topics.forEach((topic: string) => inferredSkills.add(topic));
                  }
                });
              }

              // Convert Set to Array and limit to top 15 skills
              if (inferredSkills.size > 0) {
                userUpdates.skills = Array.from(inferredSkills).slice(0, 15);
              }

              // Contact & Social Information
              if (gitlabData.skype) userUpdates.skype = gitlabData.skype;
              if (gitlabData.linkedin) userUpdates.linkedin = gitlabData.linkedin;
              if (gitlabData.twitter) userUpdates.twitter = gitlabData.twitter;
              if (gitlabData.discord) userUpdates.discord = gitlabData.discord;
              if (gitlabData.websiteUrl) userUpdates.websiteUrl = gitlabData.websiteUrl;
              if (gitlabData.workInformation) userUpdates.workInformation = gitlabData.workInformation;
              if (gitlabData.localTime) userUpdates.localTime = gitlabData.localTime;
              if (gitlabData.birthday) userUpdates.birthday = moment(gitlabData.birthday).toDate();
              if (gitlabData.hireDate) userUpdates.hireDate = moment(gitlabData.hireDate).toDate();
              if (gitlabData.terminationDate) userUpdates.terminationDate = moment(gitlabData.terminationDate).toDate();
              if (gitlabData.language) userUpdates.language = gitlabData.language;
              if (gitlabData.theme) userUpdates.theme = gitlabData.theme;
              if (gitlabData.bio) userUpdates.bio = gitlabData.bio;
              if (gitlabData.location) userUpdates.location = gitlabData.location;
              if (gitlabData.pronouns) userUpdates.pronouns = gitlabData.pronouns;
              if (gitlabData.publicEmail) userUpdates.publicEmail = gitlabData.publicEmail;
              if (gitlabData.webUrl) userUpdates.webUrl = gitlabData.webUrl;

              // Activity Statistics
              if (typeof gitlabData.groupCount === 'number') userUpdates.groupCount = gitlabData.groupCount;
              if (typeof gitlabData.projectCount === 'number') userUpdates.projectCount = gitlabData.projectCount;
              if (typeof gitlabData.contributionsCount === 'number') userUpdates.contributionsCount = gitlabData.contributionsCount;
              if (typeof gitlabData.discussionsCount === 'number') userUpdates.discussionsCount = gitlabData.discussionsCount;
              if (typeof gitlabData.issuesCreatedCount === 'number') userUpdates.issuesCreatedCount = gitlabData.issuesCreatedCount;
              if (typeof gitlabData.mergeRequestsCount === 'number') userUpdates.mergeRequestsCount = gitlabData.mergeRequestsCount;
              if (typeof gitlabData.commitsCount === 'number') userUpdates.commitsCount = gitlabData.commitsCount;

              // Security & Access Control
              if (typeof gitlabData.twoFactorEnabled === 'boolean') userUpdates.twoFactorEnabled = gitlabData.twoFactorEnabled;
              if (gitlabData.lockedAt) userUpdates.lockedAt = moment(gitlabData.lockedAt).toDate();
              if (gitlabData.unlockAt) userUpdates.unlockAt = moment(gitlabData.unlockAt).toDate();
              if (gitlabData.authenticationType) userUpdates.authenticationType = gitlabData.authenticationType;
              if (typeof gitlabData.emailVerified === 'boolean') userUpdates.emailVerified = gitlabData.emailVerified;
              if (typeof gitlabData.phoneVerified === 'boolean') userUpdates.phoneVerified = gitlabData.phoneVerified;

              // Organization & Management
              if (gitlabData.manager) {
                userUpdates.manager = {
                  id: gitlabData.manager.id?.toString() || '',
                  name: gitlabData.manager.name || '',
                  email: gitlabData.manager.email
                };
              }
              if (gitlabData.reportsTo) {
                userUpdates.reportsTo = {
                  id: gitlabData.reportsTo.id?.toString() || '',
                  name: gitlabData.reportsTo.name || '',
                  email: gitlabData.reportsTo.email
                };
              }
              if (gitlabData.costCenter) userUpdates.costCenter = gitlabData.costCenter;
              if (gitlabData.employeeNumber) userUpdates.employeeNumber = gitlabData.employeeNumber;

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

              logger.debug('User updated comprehensively', {
                userId: updatedUser._id,
                gitlabId: user.gitlabId,
                updatedFields: Object.keys(userUpdates).length - 1 // Exclude lastSynced
              });

              // Bulk updates for related models
              const bulkOps: any[] = [];

              // Project: Update assignedTo
              bulkOps.push({
                updateMany: {
                  filter: { 'assignedTo.id': user.gitlabId.toString() },
                  update: {
                    $set: {
                      'assignedTo.$[elem].name': userUpdates.name || gitlabData.name,
                      'assignedTo.$[elem].department': userUpdates.department,
                      'assignedTo.$[elem].role': 'Developer' // Simplified
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
                // Build separate operation arrays for each model
                const projectOps = [bulkOps[0]]; // Project assignedTo update
                const issueOps = [bulkOps[1], bulkOps[2]]; // Issue author and assignees
                const mergeRequestOps = [bulkOps[3], bulkOps[4], bulkOps[5]]; // MR author, assignees, reviewers
                const taskOps = [bulkOps[6], bulkOps[7]]; // Task assignedTo and assignedBy
                const commitOps = [bulkOps[8]]; // Commit author
                const deptOps = [bulkOps[9]]; // Department head

                // Execute each model's operations if they exist
                if (projectOps.length > 0) await Project.bulkWrite(projectOps);
                if (issueOps.length > 0) await Issue.bulkWrite(issueOps);
                if (mergeRequestOps.length > 0) await MergeRequest.bulkWrite(mergeRequestOps);
                if (taskOps.length > 0) await Task.bulkWrite(taskOps);
                if (commitOps.length > 0) await Commit.bulkWrite(commitOps);
                if (deptOps.length > 0) await Department.bulkWrite(deptOps);

                logger.debug('Related models updated', { userId: updatedUser._id, gitlabId: user.gitlabId });
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
            // User doesn't exist in database - this is expected for new GitLab users
            logger.info('GitLab user not found in database, skipping sync', {
              gitlabId: user.gitlabId,
              username: user.username
            });
            // Note: We could create the user here if needed, but for now we just log and skip
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
