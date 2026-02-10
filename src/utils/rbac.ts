import { User } from '../models/User';
import { Project } from '../models/Project';
import { ProjectSprintRepoMapping } from '../models/ProjectSprintRepoMapping';
import { logger } from './logger';

/**
 * Check if a user role qualifies as admin.
 * Uses word-boundary matching to avoid partial matches
 * (e.g., "Database Administrator" should NOT match "admin").
 */
export const isAdmin = (userRole: string): boolean => {
  const adminRoles = ['ceo', 'cto', 'manager', 'director', 'admin'];
  const words = userRole.toLowerCase().split(/[\s/,\-_]+/);
  return adminRoles.some(role => words.includes(role));
};

/**
 * Extract numeric GitLab project ID from a GitLab Global ID string.
 * Handles format: "gid://gitlab/Project/617" -> 617
 */
export const extractGitlabIdFromGid = (gid: string): number | null => {
  if (!gid) return null;

  // Handle "gid://gitlab/Project/XXX" format
  const gidMatch = gid.match(/\/(\d+)$/);
  if (gidMatch) {
    return parseInt(gidMatch[1], 10);
  }

  // Handle plain numeric string
  const numericValue = parseInt(gid, 10);
  if (!isNaN(numericValue)) {
    return numericValue;
  }

  return null;
};

/**
 * Get the GitLab project IDs that a user is assigned to.
 * Reads from user.projects[] which stores GitLab GID strings.
 */
export const getUserProjectGitlabIds = async (userId: string): Promise<number[]> => {
  try {
    const user = await User.findById(userId).select('projects').lean();

    if (!user || !user.projects || user.projects.length === 0) {
      logger.info('User has no project assignments', { userId });
      return [];
    }

    const gitlabIds = user.projects
      .map((p: { id: string }) => extractGitlabIdFromGid(p.id))
      .filter((id: number | null): id is number => id !== null);

    logger.info('Extracted user project gitlabIds', {
      userId,
      projectCount: user.projects.length,
      gitlabIdCount: gitlabIds.length,
    });

    return gitlabIds;
  } catch (error) {
    logger.error('Error getting user project gitlabIds', { userId, error });
    return [];
  }
};

/**
 * Result of accessible project lookup.
 * - isAdminUser: true if user is admin (no filtering needed)
 * - projectIds: MongoDB _id strings of projects the user can access
 */
export interface AccessibleProjectsResult {
  isAdminUser: boolean;
  projectIds: string[];
}

/**
 * Get MongoDB project _ids accessible by a user.
 * Admins see all; regular users see only projects listed in their user.projects[].
 */
export const getAccessibleProjectIds = async (
  userId: string,
  userRole: string
): Promise<AccessibleProjectsResult> => {
  if (isAdmin(userRole)) {
    logger.info('Admin user detected, granting full project access', { userId, userRole });
    return { isAdminUser: true, projectIds: [] };
  }

  try {
    const gitlabIds = await getUserProjectGitlabIds(userId);

    if (gitlabIds.length === 0) {
      logger.warn('Non-admin user has no assigned projects', { userId, userRole });
      return { isAdminUser: false, projectIds: [] };
    }

    // Find projects matching those gitlabIds
    const projects = await Project.find({
      gitlabId: { $in: gitlabIds },
      isActive: true,
    }).select('_id').lean();

    const projectIds = projects.map(p => p._id.toString());

    logger.info('Resolved accessible project IDs', {
      userId,
      gitlabIdCount: gitlabIds.length,
      resolvedProjectCount: projectIds.length,
    });

    return { isAdminUser: false, projectIds };
  } catch (error) {
    logger.error('Error resolving accessible project IDs', { userId, error });
    return { isAdminUser: false, projectIds: [] };
  }
};

/**
 * Get sprint repo IDs accessible by a user.
 * Admins see all; regular users only see repos linked to their assigned projects.
 *
 * Returns:
 * - Empty array [] if user is admin (no filtering needed)
 * - Array of sprintRepoId strings if user has accessible repos
 * - ['no-access'] sentinel if user has no accessible sprint repos
 */
export const getAccessibleSprintRepoIds = async (
  userId: string,
  userRole: string
): Promise<string[]> => {
  const { isAdminUser, projectIds } = await getAccessibleProjectIds(userId, userRole);

  if (isAdminUser) {
    return []; // Empty = no filtering needed (admin)
  }

  if (projectIds.length === 0) {
    return ['no-access']; // Sentinel: user has no projects
  }

  try {
    // Find sprint repos linked to these projects
    const mappings = await ProjectSprintRepoMapping.find({
      projectId: { $in: projectIds },
      isActive: true,
    }).select('sprintRepoId').lean();

    if (!mappings || mappings.length === 0) {
      logger.warn('No sprint repos linked to user projects', { userId, projectIds });
      return ['no-access'];
    }

    const sprintRepoIds = [...new Set(mappings.map(m => m.sprintRepoId.toString()))];

    logger.info('Resolved accessible sprint repo IDs', {
      userId,
      projectCount: projectIds.length,
      mappingCount: mappings.length,
      sprintRepoCount: sprintRepoIds.length,
    });

    return sprintRepoIds;
  } catch (error) {
    logger.error('Error resolving accessible sprint repo IDs', { userId, error });
    return ['no-access'];
  }
};
