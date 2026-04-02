export const ACCESS_ROLE = {
  STANDARD_USER: 'STANDARD_USER',
  ADMIN: 'ADMIN',
  CLUSTER_SUPER_ADMIN: 'CLUSTER_SUPER_ADMIN',
  FINANCE: 'FINANCE',
} as const;

export type AccessRole = (typeof ACCESS_ROLE)[keyof typeof ACCESS_ROLE];

export const ACCESS_ROLE_VALUES = Object.values(ACCESS_ROLE) as AccessRole[];
export const DEFAULT_ACCESS_ROLE: AccessRole = ACCESS_ROLE.STANDARD_USER;

export const PERMISSION = {
  VIEW_DEPARTMENT_MEMBERS: 'VIEW_DEPARTMENT_MEMBERS',
  MANAGE_DEPARTMENT_USERS: 'MANAGE_DEPARTMENT_USERS',
  MANAGE_DEPARTMENT_PROJECTS: 'MANAGE_DEPARTMENT_PROJECTS',
  MANAGE_DEPARTMENT_SPRINTS: 'MANAGE_DEPARTMENT_SPRINTS',
  MANAGE_DEPARTMENT_TASKS: 'MANAGE_DEPARTMENT_TASKS',
  VIEW_DEPARTMENT_COST_REPORTS: 'VIEW_DEPARTMENT_COST_REPORTS',
  VIEW_DEPARTMENT_RESOURCE_UTILIZATION: 'VIEW_DEPARTMENT_RESOURCE_UTILIZATION',
  VIEW_PLATFORM_COST_REPORTS: 'VIEW_PLATFORM_COST_REPORTS',
  DOWNLOAD_PLATFORM_COST_REPORTS: 'DOWNLOAD_PLATFORM_COST_REPORTS',
} as const;

export type Permission = (typeof PERMISSION)[keyof typeof PERMISSION];

export const PERMISSION_VALUES = Object.values(PERMISSION) as Permission[];

export type ProjectAccessScope = 'none' | 'assigned' | 'department';

const ROLE_PERMISSION_MAP: Record<AccessRole, Permission[]> = {
  [ACCESS_ROLE.STANDARD_USER]: [PERMISSION.VIEW_DEPARTMENT_MEMBERS],
  [ACCESS_ROLE.ADMIN]: [
    PERMISSION.VIEW_DEPARTMENT_MEMBERS,
    PERMISSION.MANAGE_DEPARTMENT_USERS,
    PERMISSION.MANAGE_DEPARTMENT_PROJECTS,
    PERMISSION.MANAGE_DEPARTMENT_SPRINTS,
    PERMISSION.MANAGE_DEPARTMENT_TASKS,
  ],
  [ACCESS_ROLE.CLUSTER_SUPER_ADMIN]: [
    PERMISSION.VIEW_DEPARTMENT_MEMBERS,
    PERMISSION.VIEW_DEPARTMENT_COST_REPORTS,
    PERMISSION.VIEW_DEPARTMENT_RESOURCE_UTILIZATION,
    PERMISSION.MANAGE_DEPARTMENT_PROJECTS,
    PERMISSION.MANAGE_DEPARTMENT_SPRINTS,
    PERMISSION.MANAGE_DEPARTMENT_TASKS,
  ],
  [ACCESS_ROLE.FINANCE]: [
    PERMISSION.VIEW_DEPARTMENT_MEMBERS,
    PERMISSION.VIEW_PLATFORM_COST_REPORTS,
    PERMISSION.DOWNLOAD_PLATFORM_COST_REPORTS,
  ],
};

export function normalizeAccessRole(value?: string | null): AccessRole {
  if (!value) {
    return DEFAULT_ACCESS_ROLE;
  }

  const normalizedValue = value
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');

  if (ACCESS_ROLE_VALUES.includes(normalizedValue as AccessRole)) {
    return normalizedValue as AccessRole;
  }

  return DEFAULT_ACCESS_ROLE;
}

export function getPermissionsForAccessRole(
  accessRole?: string | null,
  isSuperAdmin: boolean = false
): Permission[] {
  if (isSuperAdmin) {
    return [...PERMISSION_VALUES];
  }

  return [...ROLE_PERMISSION_MAP[normalizeAccessRole(accessRole)]];
}

export function hasPermission(
  permissions: readonly string[] | undefined,
  permission: Permission
): boolean {
  return Array.isArray(permissions) && permissions.includes(permission);
}

export function hasAnyPermission(
  permissions: readonly string[] | undefined,
  requiredPermissions: Permission[]
): boolean {
  return requiredPermissions.some((permission) => hasPermission(permissions, permission));
}

export function getProjectAccessScope(
  accessRole?: string | null,
  isSuperAdmin: boolean = false
): ProjectAccessScope {
  if (isSuperAdmin) {
    return 'department';
  }

  switch (normalizeAccessRole(accessRole)) {
    case ACCESS_ROLE.ADMIN:
    case ACCESS_ROLE.CLUSTER_SUPER_ADMIN:
      return 'department';
    case ACCESS_ROLE.STANDARD_USER:
      return 'assigned';
    case ACCESS_ROLE.FINANCE:
    default:
      return 'none';
  }
}

export function canManageDepartmentUsers(
  accessRole?: string | null,
  isSuperAdmin: boolean = false
): boolean {
  return isSuperAdmin || normalizeAccessRole(accessRole) === ACCESS_ROLE.ADMIN;
}

export function canManageDepartmentProjects(
  accessRole?: string | null,
  isSuperAdmin: boolean = false
): boolean {
  const normalizedRole = normalizeAccessRole(accessRole);
  return (
    isSuperAdmin ||
    normalizedRole === ACCESS_ROLE.ADMIN ||
    normalizedRole === ACCESS_ROLE.CLUSTER_SUPER_ADMIN
  );
}

export function canManageDepartmentSprints(
  accessRole?: string | null,
  isSuperAdmin: boolean = false
): boolean {
  const normalizedRole = normalizeAccessRole(accessRole);
  return (
    isSuperAdmin ||
    normalizedRole === ACCESS_ROLE.ADMIN ||
    normalizedRole === ACCESS_ROLE.CLUSTER_SUPER_ADMIN
  );
}

export function canMutateTasks(
  accessRole?: string | null,
  isSuperAdmin: boolean = false
): boolean {
  if (isSuperAdmin) {
    return true;
  }

  const normalizedRole = normalizeAccessRole(accessRole);
  return (
    normalizedRole === ACCESS_ROLE.ADMIN ||
    normalizedRole === ACCESS_ROLE.CLUSTER_SUPER_ADMIN ||
    normalizedRole === ACCESS_ROLE.STANDARD_USER
  );
}

export function canViewDepartmentMembers(
  accessRole?: string | null,
  isSuperAdmin: boolean = false
): boolean {
  return isSuperAdmin || ACCESS_ROLE_VALUES.includes(normalizeAccessRole(accessRole));
}

export function canViewDepartmentReporting(
  accessRole?: string | null,
  isSuperAdmin: boolean = false
): boolean {
  return isSuperAdmin || normalizeAccessRole(accessRole) === ACCESS_ROLE.CLUSTER_SUPER_ADMIN;
}

export function canViewPlatformCostReports(
  accessRole?: string | null,
  isSuperAdmin: boolean = false
): boolean {
  return isSuperAdmin || normalizeAccessRole(accessRole) === ACCESS_ROLE.FINANCE;
}

export function canDownloadPlatformCostReports(
  accessRole?: string | null,
  isSuperAdmin: boolean = false
): boolean {
  return isSuperAdmin || normalizeAccessRole(accessRole) === ACCESS_ROLE.FINANCE;
}

export function canManageAccessRoles(
  accessRole?: string | null,
  isSuperAdmin: boolean = false
): boolean {
  return isSuperAdmin;
}
