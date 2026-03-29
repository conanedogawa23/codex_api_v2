import mongoose from 'mongoose';

import { AppError } from '../middleware';
import { Department } from '../models/Department';
import { Project } from '../models/Project';
import { ProjectSprintRepoMapping } from '../models/ProjectSprintRepoMapping';
import { User } from '../models/User';
import {
  ACCESS_ROLE,
  type AccessRole,
  type Permission,
  getPermissionsForAccessRole,
  getProjectAccessScope,
  hasPermission,
  normalizeAccessRole,
} from './accessControl';
import { AuthenticatedUser, GraphQLContext, requireCurrentUser } from './auth';
import { logger } from './logger';

type FilterObject = Record<string, unknown>;
type ProjectAccessMode = 'mongo' | 'gitlab';

interface ProjectIdentifierDocument {
  _id: { toString(): string };
  gitlabId?: number | null;
  department?: string | null;
}

interface ProjectIdentifiers {
  projectIds: string[];
  projectGitlabIds: number[];
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
  accessRole: AccessRole;
  permissions: Permission[];
}

export interface ContextAccessibleSprintReposResult {
  isSuperAdmin: boolean;
  sprintRepoIds: string[];
}

const IMPOSSIBLE_ACCESS_VALUE = '__rbac_no_access__';

function normalizeDepartmentName(value?: string | null): string {
  return value?.trim() || '';
}

function dedupeProjects(projects: ProjectIdentifierDocument[]): ProjectIdentifierDocument[] {
  const projectsById = new Map<string, ProjectIdentifierDocument>();

  for (const project of projects) {
    projectsById.set(project._id.toString(), project);
  }

  return [...projectsById.values()];
}

function toProjectIdentifiers(projects: ProjectIdentifierDocument[]): ProjectIdentifiers {
  return {
    projectIds: [...new Set(projects.map((project) => project._id.toString()))],
    projectGitlabIds: [
      ...new Set(
        projects
          .map((project) => project.gitlabId)
          .filter((gitlabId): gitlabId is number => typeof gitlabId === 'number')
      ),
    ],
  };
}

function buildProjectIdentifierSet(projects: ProjectIdentifierDocument[]): Set<string> {
  const identifiers = new Set<string>();

  for (const project of projects) {
    identifiers.add(project._id.toString());
    if (typeof project.gitlabId === 'number') {
      identifiers.add(project.gitlabId.toString());
    }
  }

  return identifiers;
}

export const isAdmin = (accessRole: string | undefined | null): boolean =>
  normalizeAccessRole(accessRole) === ACCESS_ROLE.ADMIN;

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

export const isDepartmentInScope = (
  value: GraphQLContext | AuthenticatedUser | null | undefined,
  department: string | undefined | null
): boolean => {
  if (!value || !department) {
    return false;
  }

  const currentUser = 'currentUser' in value ? value.currentUser : value;
  if (!currentUser) {
    return false;
  }

  if (currentUser.isSuperAdmin) {
    return true;
  }

  const currentDepartment = normalizeDepartmentName(currentUser.department);
  const targetDepartment = normalizeDepartmentName(department);
  if (!currentDepartment || !targetDepartment) {
    return false;
  }

  return currentDepartment.toLowerCase() === targetDepartment.toLowerCase();
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

async function resolveProjectsFromIdentifiers({
  projectIds,
  projectGitlabIds,
}: ProjectIdentifiers): Promise<ProjectIdentifierDocument[]> {
  const objectIds = projectIds
    .filter((projectId) => mongoose.Types.ObjectId.isValid(projectId))
    .map((projectId) => new mongoose.Types.ObjectId(projectId));

  const queryFilters: Array<Record<string, unknown>> = [];
  if (objectIds.length > 0) {
    queryFilters.push({ _id: { $in: objectIds } });
  }
  if (projectGitlabIds.length > 0) {
    queryFilters.push({ gitlabId: { $in: projectGitlabIds } });
  }

  if (queryFilters.length === 0) {
    return [];
  }

  return Project.find({
    isActive: true,
    ...(queryFilters.length === 1 ? queryFilters[0] : { $or: queryFilters }),
  })
    .select('_id gitlabId department')
    .lean();
}

async function resolveDepartmentProjects(departmentName: string): Promise<ProjectIdentifierDocument[]> {
  const normalizedDepartment = normalizeDepartmentName(departmentName);
  if (!normalizedDepartment) {
    return [];
  }

  const [department, projectsByDepartment] = await Promise.all([
    Department.findOne({ name: normalizedDepartment, isActive: true }).select('projects').lean(),
    Project.find({ department: normalizedDepartment, isActive: true })
      .select('_id gitlabId department')
      .lean(),
  ]);

  const departmentProjectIdentifiers = Array.isArray(department?.projects)
    ? department.projects
        .map((identifier) => String(identifier).trim())
        .filter((identifier) => identifier.length > 0)
    : [];

  const linkedProjects = await resolveProjectsFromIdentifiers({
    projectIds: [...new Set(departmentProjectIdentifiers.filter((identifier) => mongoose.Types.ObjectId.isValid(identifier)))],
    projectGitlabIds: [
      ...new Set(
        departmentProjectIdentifiers
          .map((identifier) => extractGitlabIdFromGid(identifier))
          .filter((gitlabId): gitlabId is number => gitlabId !== null)
      ),
    ],
  });

  return dedupeProjects([...projectsByDepartment, ...linkedProjects]);
}

export const getUserProjectIdentifiers = async (userId: string): Promise<ProjectIdentifiers> => {
  try {
    const user = await User.findById(userId).select('projects').lean();

    if (!user?.projects?.length) {
      return {
        projectIds: [],
        projectGitlabIds: [],
      };
    }

    const projectIds = [
      ...new Set(
        user.projects
          .map((project: { id: string }) => String(project.id).trim())
          .filter((projectId: string) => mongoose.Types.ObjectId.isValid(projectId))
      ),
    ];
    const projectGitlabIds = [
      ...new Set(
        user.projects
          .map((project: { id: string }) => extractGitlabIdFromGid(project.id))
          .filter((gitlabId: number | null): gitlabId is number => gitlabId !== null)
      ),
    ];

    return {
      projectIds,
      projectGitlabIds,
    };
  } catch (error) {
    logger.error('Error getting user project identifiers', { userId, error });
    return {
      projectIds: [],
      projectGitlabIds: [],
    };
  }
};

export const getUserProjectGitlabIds = async (userId: string): Promise<number[]> => {
  const identifiers = await getUserProjectIdentifiers(userId);
  return identifiers.projectGitlabIds;
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

function toMongoIdValues(values: string[]): Array<string | mongoose.Types.ObjectId> {
  const expandedValues: Array<string | mongoose.Types.ObjectId> = [];

  for (const value of values) {
    expandedValues.push(value);
    if (mongoose.Types.ObjectId.isValid(value)) {
      expandedValues.push(new mongoose.Types.ObjectId(value));
    }
  }

  return expandedValues;
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
  const accessRole = normalizeAccessRole(currentUser.accessRole);
  const permissions = getPermissionsForAccessRole(accessRole, currentUser.isSuperAdmin);

  if (currentUser.isSuperAdmin) {
    return {
      isSuperAdmin: true,
      projectIds: [],
      projectGitlabIds: [],
      accessRole,
      permissions,
    };
  }

  const projectAccessScope = getProjectAccessScope(accessRole, currentUser.isSuperAdmin);
  if (projectAccessScope === 'none') {
    return {
      isSuperAdmin: false,
      projectIds: [],
      projectGitlabIds: [],
      accessRole,
      permissions,
    };
  }

  try {
    if (projectAccessScope === 'department') {
      const departmentProjects = await resolveDepartmentProjects(currentUser.department);
      const identifiers = toProjectIdentifiers(departmentProjects);

      return {
        isSuperAdmin: false,
        projectIds: identifiers.projectIds,
        projectGitlabIds: identifiers.projectGitlabIds,
        accessRole,
        permissions,
      };
    }

    const [assignedIdentifiers, departmentProjects] = await Promise.all([
      getUserProjectIdentifiers(currentUser.userId),
      resolveDepartmentProjects(currentUser.department),
    ]);
    const assignedProjects = await resolveProjectsFromIdentifiers(assignedIdentifiers);
    const allowedDepartmentProjectIds = buildProjectIdentifierSet(departmentProjects);
    const scopedProjects = assignedProjects.filter((project) => {
      const projectId = project._id.toString();
      if (allowedDepartmentProjectIds.has(projectId)) {
        return true;
      }

      return typeof project.gitlabId === 'number' && allowedDepartmentProjectIds.has(project.gitlabId.toString());
    });
    const identifiers = toProjectIdentifiers(scopedProjects);

    return {
      isSuperAdmin: false,
      projectIds: identifiers.projectIds,
      projectGitlabIds: identifiers.projectGitlabIds,
      accessRole,
      permissions,
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
      accessRole,
      permissions,
    };
  }
};

export const requirePermission = (
  context: GraphQLContext,
  permission: Permission
): AuthenticatedUser => {
  const currentUser = requireCurrentUser(context);

  if (currentUser.isSuperAdmin) {
    return currentUser;
  }

  if (!hasPermission(currentUser.permissions, permission)) {
    logger.warn('User denied permission', {
      userId: currentUser.userId,
      accessRole: currentUser.accessRole,
      permission,
    });
    throw new AppError('Forbidden', 403);
  }

  return currentUser;
};

export const requireDepartmentScope = (
  context: GraphQLContext,
  department: string | undefined | null
): string => {
  const currentUser = requireCurrentUser(context);
  const currentDepartment = normalizeDepartmentName(currentUser.department);
  const requestedDepartment = normalizeDepartmentName(department) || currentDepartment;

  if (currentUser.isSuperAdmin) {
    return requestedDepartment;
  }

  if (!currentDepartment || !requestedDepartment || currentDepartment.toLowerCase() !== requestedDepartment.toLowerCase()) {
    logger.warn('User denied department-scoped access', {
      userId: currentUser.userId,
      currentDepartment,
      requestedDepartment,
    });
    throw new AppError('Forbidden', 403);
  }

  return requestedDepartment;
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
      $in: accessibleValues.length > 0 ? accessibleValues : [IMPOSSIBLE_ACCESS_VALUE],
    },
  });
};

export const requireSprintRepoAccess = async (
  context: GraphQLContext,
  sprintRepoId: string | null | undefined
): Promise<void> => {
  const currentUser = requireCurrentUser(context);

  if (currentUser.isSuperAdmin) {
    return;
  }

  const normalizedSprintRepoId = sprintRepoId ? String(sprintRepoId) : null;
  if (!normalizedSprintRepoId) {
    throw new AppError('Forbidden', 403);
  }

  const accessibleSprintRepos = await getContextAccessibleSprintRepoIds(context);
  if (!accessibleSprintRepos.sprintRepoIds.includes(normalizedSprintRepoId)) {
    logger.warn('User denied sprint repo access', {
      userId: currentUser.userId,
      sprintRepoId: normalizedSprintRepoId,
    });
    throw new AppError('Forbidden', 403);
  }
};

export const withSprintRepoFilter = async (
  context: GraphQLContext,
  filter: FilterObject,
  sprintRepoField: string = 'sprintRepoId'
): Promise<FilterObject> => {
  const currentUser = requireCurrentUser(context);

  if (currentUser.isSuperAdmin) {
    return filter;
  }

  const accessibleSprintRepos = await getContextAccessibleSprintRepoIds(context);
  return mergeFilterWithConstraint(filter, {
    [sprintRepoField]: {
      $in:
        accessibleSprintRepos.sprintRepoIds.length > 0
          ? toMongoIdValues(accessibleSprintRepos.sprintRepoIds)
          : [IMPOSSIBLE_ACCESS_VALUE],
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

  if (!userId) {
    logger.warn('Missing userId or userRole for project access check', { userId, userRole });
    return { isAdminUser: false, projectIds: [], projectGitlabIds: [] };
  }

  try {
    const user = await User.findById(userId)
      .select('_id email username gitlabId department role accessRole isActive isSuperAdmin')
      .lean();
    if (!user || !user.isActive) {
      return { isAdminUser: false, projectIds: [], projectGitlabIds: [] };
    }

    if (user.isSuperAdmin) {
      return { isAdminUser: true, projectIds: [], projectGitlabIds: [] };
    }

    const accessRole = normalizeAccessRole(user.accessRole);
    if (getProjectAccessScope(accessRole) === 'department') {
      const departmentProjects = await resolveDepartmentProjects(user.department);
      const identifiers = toProjectIdentifiers(departmentProjects);
      return {
        isAdminUser: false,
        projectIds: identifiers.projectIds,
        projectGitlabIds: identifiers.projectGitlabIds,
      };
    }

    if (getProjectAccessScope(accessRole) === 'none') {
      return { isAdminUser: false, projectIds: [], projectGitlabIds: [] };
    }

    const [assignedIdentifiers, departmentProjects] = await Promise.all([
      getUserProjectIdentifiers(userId),
      resolveDepartmentProjects(user.department),
    ]);
    const assignedProjects = await resolveProjectsFromIdentifiers(assignedIdentifiers);
    const allowedDepartmentProjectIds = buildProjectIdentifierSet(departmentProjects);
    const scopedProjects = assignedProjects.filter((project) => {
      const projectId = project._id.toString();
      if (allowedDepartmentProjectIds.has(projectId)) {
        return true;
      }

      return typeof project.gitlabId === 'number' && allowedDepartmentProjectIds.has(project.gitlabId.toString());
    });
    const identifiers = toProjectIdentifiers(scopedProjects);

    return {
      isAdminUser: false,
      projectIds: identifiers.projectIds,
      projectGitlabIds: identifiers.projectGitlabIds,
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
