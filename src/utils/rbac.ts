import { AppError } from '../middleware';
import { Project } from '../models/Project';
import { ProjectSprintRepoMapping } from '../models/ProjectSprintRepoMapping';
import { User } from '../models/User';
import { AuthenticatedUser, GraphQLContext, requireCurrentUser } from './auth';
import { logger } from './logger';

type FilterObject = Record<string, unknown>;
type ProjectAccessMode = 'mongo' | 'gitlab';

interface ProjectIdentifierDocument {
  _id: { toString(): string };
  gitlabId?: number | null;
}

export interface AccessibleProjectsResult {
  isAdminUser: boolean;
  projectIds: string[];
  projectGitlabIds: number[];
}

export interface ContextAccessibleProjectsResult {
  isSuperAdmin: boolean;
  projectIds: string[];
  projectGitlabIds: number[];
}

export interface ContextAccessibleSprintReposResult {
  isSuperAdmin: boolean;
  sprintRepoIds: string[];
}

/**
 * Check if a user role qualifies as admin.
 * Uses word-boundary matching to avoid partial matches
 * (e.g., "Database Administrator" should NOT match "admin").
 */
export const isAdmin = (userRole: string | undefined | null): boolean => {
  if (!userRole) {
    return false;
  }

  const adminRoles = ['ceo', 'cto', 'manager', 'director', 'admin'];
  const words = userRole.toLowerCase().split(/[\s/,\-_]+/);
  return adminRoles.some((role) => words.includes(role));
};

export const isSuperAdminUser = (
  value: GraphQLContext | Pick<AuthenticatedUser, 'isSuperAdmin'> | null | undefined
): boolean => {
  if (!value) {
    return false;
  }

  if ('currentUser' in value) {
    return value.currentUser?.isSuperAdmin === true;
  }

  return value.isSuperAdmin === true;
};

/**
 * Extract numeric GitLab project ID from a GitLab Global ID string.
 * Handles format: "gid://gitlab/Project/617" -> 617
 */
export const extractGitlabIdFromGid = (gid: string): number | null => {
  if (!gid) {
    return null;
  }

  const gidMatch = gid.match(/\/(\d+)$/);
  if (gidMatch) {
    return parseInt(gidMatch[1], 10);
  }

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

    if (!user?.projects?.length) {
      logger.info('User has no project assignments', { userId });
      return [];
    }

    const gitlabIds = user.projects
      .map((project: { id: string }) => extractGitlabIdFromGid(project.id))
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

async function resolveProjectsFromGitlabIds(gitlabIds: number[]): Promise<ProjectIdentifierDocument[]> {
  if (gitlabIds.length === 0) {
    return [];
  }

  return Project.find({
    gitlabId: { $in: gitlabIds },
    isActive: true,
  })
    .select('_id gitlabId')
    .lean();
}

function mergeFilterWithConstraint(filter: FilterObject, constraint: FilterObject): FilterObject {
  if (Object.keys(filter).length === 0) {
    return constraint;
  }

  return {
    $and: [filter, constraint],
  };
}

function normalizeProjectIdentifier(
  projectId: string | number | null | undefined,
  mode: ProjectAccessMode
): string | number | null {
  if (projectId === null || projectId === undefined) {
    return null;
  }

  if (mode === 'gitlab') {
    if (typeof projectId === 'number') {
      return projectId;
    }

    const numericProjectId = Number(projectId);
    return Number.isFinite(numericProjectId) ? numericProjectId : null;
  }

  return String(projectId);
}

function getAccessibleValues(
  accessibleProjects: ContextAccessibleProjectsResult,
  mode: ProjectAccessMode
): Array<string | number> {
  return mode === 'gitlab'
    ? accessibleProjects.projectGitlabIds
    : accessibleProjects.projectIds;
}

/**
 * Resolve accessible projects from the authenticated GraphQL context.
 * Super admins bypass project filtering entirely. Everyone else, including
 * admins, is restricted to their assigned projects.
 */
export const getContextAccessibleProjectIds = async (
  context: GraphQLContext
): Promise<ContextAccessibleProjectsResult> => {
  const currentUser = requireCurrentUser(context);

  if (currentUser.isSuperAdmin) {
    return {
      isSuperAdmin: true,
      projectIds: [],
      projectGitlabIds: [],
    };
  }

  try {
    const gitlabIds = await getUserProjectGitlabIds(currentUser.userId);
    const projects = await resolveProjectsFromGitlabIds(gitlabIds);

    return {
      isSuperAdmin: false,
      projectIds: projects.map((project) => project._id.toString()),
      projectGitlabIds: projects
        .map((project) => project.gitlabId)
        .filter((gitlabId): gitlabId is number => typeof gitlabId === 'number'),
    };
  } catch (error) {
    logger.error('Error resolving accessible projects from context', {
      userId: currentUser.userId,
      error,
    });

    return {
      isSuperAdmin: false,
      projectIds: [],
      projectGitlabIds: [],
    };
  }
};

export const requireProjectAccess = async (
  context: GraphQLContext,
  projectId: string | number | null | undefined,
  mode: ProjectAccessMode = 'mongo'
): Promise<void> => {
  const currentUser = requireCurrentUser(context);

  if (currentUser.isSuperAdmin) {
    return;
  }

  const normalizedProjectId = normalizeProjectIdentifier(projectId, mode);
  if (normalizedProjectId === null) {
    throw new AppError('Forbidden', 403);
  }

  const accessibleProjects = await getContextAccessibleProjectIds(context);
  const accessibleValues = getAccessibleValues(accessibleProjects, mode);
  const hasAccess = accessibleValues.includes(normalizedProjectId);

  if (!hasAccess) {
    logger.warn('User denied project access', {
      userId: currentUser.userId,
      projectId: normalizedProjectId,
      mode,
    });
    throw new AppError('Forbidden', 403);
  }
};

export const withProjectFilter = async (
  context: GraphQLContext,
  filter: FilterObject,
  projectField: string = 'projectId',
  mode: ProjectAccessMode = 'mongo'
): Promise<FilterObject> => {
  const currentUser = requireCurrentUser(context);

  if (currentUser.isSuperAdmin) {
    return filter;
  }

  const accessibleProjects = await getContextAccessibleProjectIds(context);
  const accessibleValues = getAccessibleValues(accessibleProjects, mode);

  return mergeFilterWithConstraint(filter, {
    [projectField]: {
      $in: accessibleValues,
    },
  });
};

export const getContextAccessibleSprintRepoIds = async (
  context: GraphQLContext
): Promise<ContextAccessibleSprintReposResult> => {
  const currentUser = requireCurrentUser(context);

  if (currentUser.isSuperAdmin) {
    return {
      isSuperAdmin: true,
      sprintRepoIds: [],
    };
  }

  const { projectIds } = await getContextAccessibleProjectIds(context);
  if (projectIds.length === 0) {
    return {
      isSuperAdmin: false,
      sprintRepoIds: [],
    };
  }

  try {
    const mappings = await ProjectSprintRepoMapping.find({
      projectId: { $in: projectIds },
      isActive: true,
    })
      .select('sprintRepoId')
      .lean();

    return {
      isSuperAdmin: false,
      sprintRepoIds: [...new Set(mappings.map((mapping) => mapping.sprintRepoId.toString()))],
    };
  } catch (error) {
    logger.error('Error resolving accessible sprint repo IDs from context', {
      userId: currentUser.userId,
      error,
    });

    return {
      isSuperAdmin: false,
      sprintRepoIds: [],
    };
  }
};

/**
 * Deprecated legacy helper retained during the migration from client-passed
 * access arguments to server-enforced context-based authorization.
 */
export const getAccessibleProjectIds = async (
  userId: string | undefined | null,
  userRole: string | undefined | null
): Promise<AccessibleProjectsResult> => {
  logger.warn('Deprecated getAccessibleProjectIds called', { userId, userRole });

  if (!userId || !userRole) {
    logger.warn('Missing userId or userRole for project access check', { userId, userRole });
    return { isAdminUser: false, projectIds: [], projectGitlabIds: [] };
  }

  if (isAdmin(userRole)) {
    return { isAdminUser: true, projectIds: [], projectGitlabIds: [] };
  }

  try {
    const gitlabIds = await getUserProjectGitlabIds(userId);
    const projects = await resolveProjectsFromGitlabIds(gitlabIds);

    return {
      isAdminUser: false,
      projectIds: projects.map((project) => project._id.toString()),
      projectGitlabIds: projects
        .map((project) => project.gitlabId)
        .filter((gitlabId): gitlabId is number => typeof gitlabId === 'number'),
    };
  } catch (error) {
    logger.error('Error resolving accessible project IDs', { userId, error });
    return { isAdminUser: false, projectIds: [], projectGitlabIds: [] };
  }
};

/**
 * Deprecated legacy helper retained while sprint modules are migrated.
 */
export const getAccessibleSprintRepoIds = async (
  userId: string | undefined | null,
  userRole: string | undefined | null
): Promise<string[]> => {
  logger.warn('Deprecated getAccessibleSprintRepoIds called', { userId, userRole });

  if (!userId || !userRole) {
    logger.warn('Missing userId or userRole for sprint repo access check', { userId, userRole });
    return ['no-access'];
  }

  const { isAdminUser, projectIds } = await getAccessibleProjectIds(userId, userRole);

  if (isAdminUser) {
    return [];
  }

  if (projectIds.length === 0) {
    return ['no-access'];
  }

  try {
    const mappings = await ProjectSprintRepoMapping.find({
      projectId: { $in: projectIds },
      isActive: true,
    })
      .select('sprintRepoId')
      .lean();

    if (!mappings.length) {
      return ['no-access'];
    }

    return [...new Set(mappings.map((mapping) => mapping.sprintRepoId.toString()))];
  } catch (error) {
    logger.error('Error resolving accessible sprint repo IDs', { userId, error });
    return ['no-access'];
  }
};
