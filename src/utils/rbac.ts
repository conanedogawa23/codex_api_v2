import { User } from '../models/User';
import { Project } from '../models/Project';
import { ProjectSprintRepoMapping } from '../models/ProjectSprintRepoMapping';
import { logger } from './logger';

/**
 * Check if a user role qualifies as admin.
 * Uses word-boundary matching to avoid partial matches
 * (e.g., "Database Administrator" should NOT match "admin").
 */
export const isAdmin = (userRole: string | undefined | null): boolean => {
  if (!userRole) return false;
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
 * Resolve the effective user role by fetching from the database.
 * Falls back to the client-provided role if DB lookup fails.
 * This ensures role checks use the authoritative DB value,
 * preventing client-side role spoofing.
 */
export const resolveUserRole = async (
  userId: string,
  clientProvidedRole: string | undefined | null
): Promise<string | null> => {
  try {
    const user = await User.findById(userId).select('role').lean();
    if (user?.role) {
      if (clientProvidedRole && user.role !== clientProvidedRole) {
        logger.warn('Client-provided role differs from DB role', {
          userId,
          clientRole: clientProvidedRole,
          dbRole: user.role,
        });
      }
      return user.role;
    }
    return clientProvidedRole || null;
  } catch (error) {
    logger.error('Error fetching user role from DB, using client-provided role', { userId, error });
    return clientProvidedRole || null;
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
 * Always fetches the user's actual role from the database for the admin check.
 */
export const getAccessibleProjectIds = async (
  userId: string | undefined | null,
  userRole: string | undefined | null
): Promise<AccessibleProjectsResult> => {
  if (!userId) {
    logger.warn('Missing userId for project access check', { userId, userRole });
    return { isAdminUser: false, projectIds: [] };
  }

  // Resolve the effective role from the database (authoritative source)
  const effectiveRole = await resolveUserRole(userId, userRole);

  if (!effectiveRole) {
    logger.warn('Could not determine user role for project access check', { userId, userRole });
    return { isAdminUser: false, projectIds: [] };
  }

  if (isAdmin(effectiveRole)) {
    logger.info('Admin user detected, granting full project access', { userId, effectiveRole });
    return { isAdminUser: true, projectIds: [] };
  }

  try {
    const gitlabIds = await getUserProjectGitlabIds(userId);

    if (gitlabIds.length === 0) {
      logger.warn('Non-admin user has no assigned projects', { userId, effectiveRole });
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
 * The user's role is always resolved from the database (not the client parameter).
 *
 * Returns:
 * - Empty array [] if user is admin (no filtering needed)
 * - Array of sprintRepoId strings if user has accessible repos
 * - ['no-access'] sentinel if user has no accessible sprint repos
 */
export const getAccessibleSprintRepoIds = async (
  userId: string | undefined | null,
  userRole: string | undefined | null
): Promise<string[]> => {
  if (!userId) {
    logger.warn('Missing userId for sprint repo access check', { userId, userRole });
    return ['no-access'];
  }

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
