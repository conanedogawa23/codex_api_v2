import type { FinanceScopeType } from '../../models/FinanceScopeOverride';

export type FinanceRateSource =
  | 'GLOBAL_DEFAULT'
  | 'ROLE_RATE'
  | 'USER_RATE'
  | 'PROJECT_OVERRIDE'
  | 'SPRINT_REPO_OVERRIDE'
  | 'SPRINT_OVERRIDE'
  | 'TASK_OVERRIDE';

export interface HourlyRateResolution {
  hourlyRate: number;
  source: FinanceRateSource;
}

export interface RateLookupMaps {
  projectCurrency: string;
  globalDefaultHourly: number;
  globalCurrency: string;
  /** Keys: `${FinanceScopeType}:${scopeId}` */
  scopeOverrides: Map<string, { hourlyRate: number; currency: string }>;
  /** Keys: user Mongo id string */
  userRates: Map<string, { hourlyRate: number; currency: string }>;
  /** Keys: `${roleKey}::${departmentNormalized}` or `${roleKey}::` */
  roleRates: Map<string, { hourlyRate: number; currency: string }>;
}

export function normalizeRoleKey(role: string | undefined | null): string {
  return (role || '').trim().toLowerCase().replace(/\s+/g, '_');
}

export function buildRoleRateKey(roleKey: string, department?: string | null): string {
  const dept = (department || '').trim().toLowerCase();
  return `${roleKey}::${dept}`;
}

function scopeKey(scopeType: FinanceScopeType, scopeId: string): string {
  return `${scopeType}:${scopeId}`;
}

function tryMapRate(
  maps: RateLookupMaps,
  hourlyRate: number,
  currency: string
): number | null {
  if (currency === maps.projectCurrency) {
    return hourlyRate;
  }
  return null;
}

function tryScopeOverride(
  maps: RateLookupMaps,
  scopeType: FinanceScopeType,
  scopeId: string | undefined | null
): HourlyRateResolution | null {
  if (!scopeId) {
    return null;
  }

  const entry = maps.scopeOverrides.get(scopeKey(scopeType, String(scopeId)));
  if (!entry) {
    return null;
  }

  const rate = tryMapRate(maps, entry.hourlyRate, entry.currency);
  if (rate === null) {
    return null;
  }

  const source: FinanceRateSource =
    scopeType === 'PROJECT'
      ? 'PROJECT_OVERRIDE'
      : scopeType === 'TASK'
        ? 'TASK_OVERRIDE'
        : scopeType === 'SPRINT'
          ? 'SPRINT_OVERRIDE'
          : 'SPRINT_REPO_OVERRIDE';

  return { hourlyRate: rate, source };
}

export function resolveHourlyRateForTask(
  maps: RateLookupMaps,
  task: {
    _id: { toString(): string };
    sprintId?: string | null;
    sprintRepoId?: string | null;
    projectId?: string | { toString(): string } | null;
  },
  projectId: string,
  assignee: { id?: string | null; role?: string | null } | null | undefined,
  assigneeDepartment?: string | null
): HourlyRateResolution {
  const taskId = task._id.toString();

  const chain: Array<() => HourlyRateResolution | null> = [
    () => tryScopeOverride(maps, 'TASK', taskId),
    () => tryScopeOverride(maps, 'SPRINT', task.sprintId),
    () => tryScopeOverride(maps, 'SPRINT_REPO', task.sprintRepoId),
    () => tryScopeOverride(maps, 'PROJECT', projectId),
    () => {
      const uid = assignee?.id?.trim();
      if (!uid) {
        return null;
      }
      const u = maps.userRates.get(uid);
      if (!u) {
        return null;
      }
      const rate = tryMapRate(maps, u.hourlyRate, u.currency);
      if (rate === null) {
        return null;
      }
      return { hourlyRate: rate, source: 'USER_RATE' };
    },
    () => {
      const rk = normalizeRoleKey(assignee?.role ?? null);
      if (!rk) {
        return null;
      }
      const dept = (assigneeDepartment || '').trim().toLowerCase();
      const keys = dept ? [buildRoleRateKey(rk, dept), buildRoleRateKey(rk, null)] : [buildRoleRateKey(rk, null)];
      for (const key of keys) {
        const r = maps.roleRates.get(key);
        if (r) {
          const rate = tryMapRate(maps, r.hourlyRate, r.currency);
          if (rate !== null) {
            return { hourlyRate: rate, source: 'ROLE_RATE' };
          }
        }
      }
      return null;
    },
  ];

  for (const fn of chain) {
    const resolved = fn();
    if (resolved) {
      return resolved;
    }
  }

  const g = tryMapRate(maps, maps.globalDefaultHourly, maps.globalCurrency);
  if (g !== null) {
    return { hourlyRate: g, source: 'GLOBAL_DEFAULT' };
  }

  return { hourlyRate: maps.globalDefaultHourly, source: 'GLOBAL_DEFAULT' };
}

export function taskHoursForCost(task: {
  actualHours?: number | null;
  estimatedHours?: number | null;
}): number {
  const actual = task.actualHours;
  if (typeof actual === 'number' && !Number.isNaN(actual)) {
    return actual;
  }
  const est = task.estimatedHours;
  if (typeof est === 'number' && !Number.isNaN(est)) {
    return est;
  }
  return 0;
}
