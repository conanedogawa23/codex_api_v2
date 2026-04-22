import mongoose from 'mongoose';
import { Project } from '../../models/Project';
import { Task } from '../../models/Task';
import { User } from '../../models/User';
import { FinanceGlobalSettings } from '../../models/FinanceGlobalSettings';
import { FinanceUserRate } from '../../models/FinanceUserRate';
import { FinanceScopeOverride } from '../../models/FinanceScopeOverride';
import { FinanceRoleRate } from '../../models/FinanceRoleRate';
import { FinanceLineItem } from '../../models/FinanceLineItem';
import { logger } from '../../utils/logger';
import {
  buildMixedIdValues,
  getUniqueSprintRepoProjectMappings,
} from '../../utils/taskProjectScope';
import {
  buildRoleRateKey,
  normalizeRoleKey,
  resolveHourlyRateForTask,
  taskHoursForCost,
  type FinanceRateSource,
  type RateLookupMaps,
} from './financeCostCalculator';

export async function getOrCreateFinanceGlobalSettings(): Promise<{
  defaultHourlyRate: number;
  defaultCurrency: string;
}> {
  const existing = await FinanceGlobalSettings.findOne({ singletonKey: 'default' }).lean();
  if (existing) {
    return {
      defaultHourlyRate: existing.defaultHourlyRate,
      defaultCurrency: existing.defaultCurrency,
    };
  }

  const created = await FinanceGlobalSettings.create({
    singletonKey: 'default',
    defaultHourlyRate: 0,
    defaultCurrency: 'USD',
  });

  return {
    defaultHourlyRate: created.defaultHourlyRate,
    defaultCurrency: created.defaultCurrency,
  };
}

async function loadScopeOverrideMap(): Promise<Map<string, { hourlyRate: number; currency: string }>> {
  const rows = await FinanceScopeOverride.find({}).lean();
  const map = new Map<string, { hourlyRate: number; currency: string }>();
  for (const row of rows) {
    map.set(`${row.scopeType}:${row.scopeId}`, {
      hourlyRate: row.hourlyRate,
      currency: row.currency,
    });
  }
  return map;
}

async function loadUserRatesForUsers(
  userIds: string[],
  asOf: Date
): Promise<Map<string, { hourlyRate: number; currency: string }>> {
  const unique = Array.from(new Set(userIds.filter((id) => id.length > 0)));
  const map = new Map<string, { hourlyRate: number; currency: string }>();
  if (unique.length === 0) {
    return map;
  }

  const objectIds = unique.filter((id) => mongoose.Types.ObjectId.isValid(id)).map((id) => new mongoose.Types.ObjectId(id));

  const rows = await FinanceUserRate.find({
    userId: { $in: objectIds },
    effectiveFrom: { $lte: asOf },
    $or: [{ effectiveTo: { $exists: false } }, { effectiveTo: null }, { effectiveTo: { $gte: asOf } }],
  })
    .sort({ effectiveFrom: -1 })
    .lean();

  for (const row of rows) {
    const uid = row.userId.toString();
    if (!map.has(uid)) {
      map.set(uid, { hourlyRate: row.hourlyRate, currency: row.currency });
    }
  }

  return map;
}

async function loadRoleRateMap(): Promise<Map<string, { hourlyRate: number; currency: string }>> {
  const rows = await FinanceRoleRate.find({}).lean();
  const map = new Map<string, { hourlyRate: number; currency: string }>();
  for (const row of rows) {
    const key = buildRoleRateKey(row.roleKey, row.departmentNormalized || '');
    map.set(key, { hourlyRate: row.hourlyRate, currency: row.currency });
  }
  return map;
}

type LeanTaskDoc = {
  _id: { toString(): string };
  title?: string;
  sprintId?: string | null;
  sprintRepoId?: string | null;
  projectId?: string | { toString(): string } | null;
  actualHours?: number | null;
  estimatedHours?: number | null;
  assignedTo?: { id?: string; name?: string; email?: string } | null;
};

export async function loadTasksForProjectCost(projectId: string): Promise<LeanTaskDoc[]> {
  const mappings = await getUniqueSprintRepoProjectMappings([projectId]);
  const sprintRepoIds = mappings.filter((m) => m.projectId === projectId).map((m) => m.sprintRepoId);
  const mixedIds = buildMixedIdValues([projectId]);
  const sprintRepoValues = buildMixedIdValues(sprintRepoIds);

  const orConditions: Record<string, unknown>[] = [{ projectId: { $in: mixedIds } }];

  if (sprintRepoValues.length > 0) {
    orConditions.push({
      sprintRepoId: { $in: sprintRepoValues },
      projectId: { $nin: mixedIds },
    });
  }

  const rows = await Task.find({
    isActive: true,
    $or: orConditions,
  }).lean();

  return rows as unknown as LeanTaskDoc[];
}

export async function computeProjectFinanceCost(
  projectId: string,
  asOf: Date = new Date()
): Promise<{
  hoursCost: number;
  lineItemsCost: number;
  totalCost: number;
  currency: string;
}> {
  const project = await Project.findById(projectId).lean();
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  const currency = (project.budget?.currency || 'USD').toUpperCase();
  const global = await getOrCreateFinanceGlobalSettings();
  const scopeOverrides = await loadScopeOverrideMap();
  const roleRates = await loadRoleRateMap();

  const tasks = await loadTasksForProjectCost(projectId);
  const assigneeIds = tasks
    .map((t) => t.assignedTo?.id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);

  const userRates = await loadUserRatesForUsers(assigneeIds, asOf);

  const usersById = new Map<string, { role?: string; department?: string }>();
  const uniqueAssignees = Array.from(new Set(assigneeIds));
  if (uniqueAssignees.length > 0) {
    const objectIds = uniqueAssignees
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));

    const users = await User.find({ _id: { $in: objectIds } })
      .select('role department')
      .lean();

    for (const u of users) {
      usersById.set(u._id.toString(), { role: u.role, department: u.department });
    }
  }

  const maps: RateLookupMaps = {
    projectCurrency: currency,
    globalDefaultHourly: global.defaultHourlyRate,
    globalCurrency: global.defaultCurrency.toUpperCase(),
    scopeOverrides,
    userRates,
    roleRates,
  };

  let hoursCost = 0;

  for (const task of tasks) {
    const assigneeId = task.assignedTo?.id;
    const userMeta = assigneeId ? usersById.get(assigneeId) : undefined;
    const resolution = resolveHourlyRateForTask(
      maps,
      task,
      projectId,
      {
        id: assigneeId,
        role: userMeta?.role,
      },
      userMeta?.department ?? null
    );

    const hours = taskHoursForCost(task);
    hoursCost += hours * resolution.hourlyRate;
  }

  const lineItems = await FinanceLineItem.find({
    projectId: new mongoose.Types.ObjectId(projectId),
    isActive: true,
  }).lean();

  let lineItemsCost = 0;
  for (const li of lineItems) {
    if (li.currency.toUpperCase() !== currency) {
      logger.warn('Skipping finance line item with mismatched currency', {
        projectId,
        lineItemId: li._id.toString(),
        lineCurrency: li.currency,
        projectCurrency: currency,
      });
      continue;
    }
    lineItemsCost += li.amount;
  }

  const totalCost = hoursCost + lineItemsCost;

  return {
    hoursCost: Math.round(hoursCost * 100) / 100,
    lineItemsCost: Math.round(lineItemsCost * 100) / 100,
    totalCost: Math.round(totalCost * 100) / 100,
    currency,
  };
}

export async function persistProjectBudgetSpent(projectId: string): Promise<void> {
  const cost = await computeProjectFinanceCost(projectId);
  const spent = Math.max(0, cost.totalCost);
  const project = await Project.findById(projectId).lean();
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  const currency = project.budget?.currency || cost.currency;

  const $set: Record<string, unknown> = {
    'budget.spent': spent,
    'budget.spentRecalculatedAt': new Date(),
  };

  if (!project.budget?.currency) {
    $set['budget.currency'] = currency;
  }

  await Project.findByIdAndUpdate(projectId, { $set });

  logger.info('Persisted budget.spent from finance calculator', { projectId, spent });
}

export async function recalculateBudgetSpentForProjects(projectIds?: string[]): Promise<{
  updated: number;
  projectIds: string[];
}> {
  let ids: string[];

  if (projectIds && projectIds.length > 0) {
    ids = projectIds;
  } else {
    const projects = await Project.find({ isActive: true }).select('_id').lean();
    ids = projects.map((p) => p._id.toString());
  }

  for (const id of ids) {
    try {
      await persistProjectBudgetSpent(id);
    } catch (error) {
      logger.error('Failed to persist budget.spent for project', { projectId: id, error });
    }
  }

  return { updated: ids.length, projectIds: ids };
}

export interface CostReportTaskRow {
  taskId: string;
  title: string;
  hours: number;
  hourlyRate: number;
  rateSource: FinanceRateSource;
  cost: number;
}

export interface CostReportProjectRow {
  projectId: string;
  projectName: string;
  currency: string;
  budgetAllocated: number;
  hoursCost: number;
  lineItemsCost: number;
  totalCost: number;
  tasks: CostReportTaskRow[];
}

export async function computeCostReport(params: {
  allowedProjectIds: string[] | null;
  filterProjectIds?: string[];
  filterTaskIds?: string[];
  filterSprintIds?: string[];
  filterSprintRepoIds?: string[];
  asOf?: Date;
}): Promise<CostReportProjectRow[]> {
  const asOf = params.asOf ?? new Date();
  const filterProjectSet =
    params.filterProjectIds && params.filterProjectIds.length > 0
      ? new Set(params.filterProjectIds.map((id) => String(id)))
      : null;
  const filterTaskSet =
    params.filterTaskIds && params.filterTaskIds.length > 0
      ? new Set(params.filterTaskIds.map((id) => String(id)))
      : null;
  const filterSprintSet =
    params.filterSprintIds && params.filterSprintIds.length > 0
      ? new Set(params.filterSprintIds.map((id) => String(id)))
      : null;
  const filterSprintRepoSet =
    params.filterSprintRepoIds && params.filterSprintRepoIds.length > 0
      ? new Set(params.filterSprintRepoIds.map((id) => String(id)))
      : null;

  const projectQuery: Record<string, unknown> = { isActive: true };

  if (params.allowedProjectIds && params.allowedProjectIds.length > 0) {
    projectQuery._id = { $in: buildMixedIdValues(params.allowedProjectIds) };
  }

  const projects = await Project.find(projectQuery).sort({ lastActivityAt: -1 }).lean();
  const rows: CostReportProjectRow[] = [];

  const global = await getOrCreateFinanceGlobalSettings();
  const scopeOverrides = await loadScopeOverrideMap();
  const roleRates = await loadRoleRateMap();

  for (const project of projects) {
    const projectId = project._id.toString();

    if (filterProjectSet && !filterProjectSet.has(projectId)) {
      continue;
    }

    let tasks = await loadTasksForProjectCost(projectId);

    if (filterTaskSet) {
      tasks = tasks.filter((t) => filterTaskSet.has(t._id.toString()));
    }
    if (filterSprintSet) {
      tasks = tasks.filter((t) => (t.sprintId ? filterSprintSet.has(String(t.sprintId)) : false));
    }
    if (filterSprintRepoSet) {
      tasks = tasks.filter((t) =>
        t.sprintRepoId ? filterSprintRepoSet.has(String(t.sprintRepoId)) : false
      );
    }

    const currency = (project.budget?.currency || 'USD').toUpperCase();

    const assigneeIds = tasks
      .map((t) => t.assignedTo?.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);

    const userRates = await loadUserRatesForUsers(assigneeIds, asOf);

    const usersById = new Map<string, { role?: string; department?: string }>();
    const uniqueAssignees = Array.from(new Set(assigneeIds));
    if (uniqueAssignees.length > 0) {
      const objectIds = uniqueAssignees
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
        .map((id) => new mongoose.Types.ObjectId(id));

      const users = await User.find({ _id: { $in: objectIds } })
        .select('role department')
        .lean();

      for (const u of users) {
        usersById.set(u._id.toString(), { role: u.role, department: u.department });
      }
    }

    const maps: RateLookupMaps = {
      projectCurrency: currency,
      globalDefaultHourly: global.defaultHourlyRate,
      globalCurrency: global.defaultCurrency.toUpperCase(),
      scopeOverrides,
      userRates,
      roleRates,
    };

    const taskRows: CostReportTaskRow[] = [];
    let hoursCost = 0;

    for (const task of tasks) {
      const assigneeId = task.assignedTo?.id;
      const userMeta = assigneeId ? usersById.get(assigneeId) : undefined;
      const resolution = resolveHourlyRateForTask(
        maps,
        task,
        projectId,
        {
          id: assigneeId,
          role: userMeta?.role,
        },
        userMeta?.department ?? null
      );

      const hours = taskHoursForCost(task);
      const cost = Math.round(hours * resolution.hourlyRate * 100) / 100;
      hoursCost += cost;

      taskRows.push({
        taskId: task._id.toString(),
        title: task.title || 'Untitled',
        hours: Math.round(hours * 100) / 100,
        hourlyRate: resolution.hourlyRate,
        rateSource: resolution.source,
        cost,
      });
    }

    const lineItems = await FinanceLineItem.find({
      projectId: project._id,
      isActive: true,
    }).lean();

    let lineItemsCost = 0;
    for (const li of lineItems) {
      if (li.currency.toUpperCase() !== currency) {
        continue;
      }
      lineItemsCost += li.amount;
    }

    const totalCost = hoursCost + lineItemsCost;

    rows.push({
      projectId,
      projectName: project.name,
      currency,
      budgetAllocated: project.budget?.allocated ?? 0,
      hoursCost: Math.round(hoursCost * 100) / 100,
      lineItemsCost: Math.round(lineItemsCost * 100) / 100,
      totalCost: Math.round(totalCost * 100) / 100,
      tasks: taskRows,
    });
  }

  return rows;
}

export { normalizeRoleKey, buildRoleRateKey };
