import { createModule, gql } from 'graphql-modules';
import mongoose from 'mongoose';

import { triggerBudgetSpentRecalculation } from '../../../jobs/schedulers/budgetSpent.scheduler';
import { AppError } from '../../../middleware';
import { FinanceGlobalSettings } from '../../../models/FinanceGlobalSettings';
import { FinanceLineItem } from '../../../models/FinanceLineItem';
import { FinanceRoleRate } from '../../../models/FinanceRoleRate';
import { FinanceScopeOverride } from '../../../models/FinanceScopeOverride';
import type { FinanceScopeType } from '../../../models/FinanceScopeOverride';
import { FinanceUserRate } from '../../../models/FinanceUserRate';
import {
  computeCostReport,
  getOrCreateFinanceGlobalSettings,
  normalizeRoleKey,
  persistProjectBudgetSpent,
  recalculateBudgetSpentForProjects,
} from '../../../services/finance/budgetSpent.service';
import { getRequestClientIp, recordAuditLogEntry } from '../../../utils/auditLogWrite';
import {
  ACCESS_ROLE,
  hasPermission,
  normalizeAccessRole,
  PERMISSION,
} from '../../../utils/accessControl';
import { GraphQLContext, requireCurrentUser } from '../../../utils/auth';
import {
  getContextAccessibleProjectIds,
  requirePermission,
  requireProjectAccess,
} from '../../../utils/rbac';

async function getScopedReportingProjectIds(
  context: GraphQLContext,
  projectId?: string
): Promise<{ projectIds: string[] | null }> {
  const currentUser = requireCurrentUser(context);
  const accessRole = normalizeAccessRole(currentUser.accessRole);

  if (currentUser.isSuperAdmin || accessRole === ACCESS_ROLE.FINANCE) {
    return {
      projectIds: projectId ? [projectId] : null,
    };
  }

  requirePermission(context, PERMISSION.VIEW_DEPARTMENT_RESOURCE_UTILIZATION);

  if (projectId) {
    await requireProjectAccess(context, projectId);
    return {
      projectIds: [projectId],
    };
  }

  const accessibleProjects = await getContextAccessibleProjectIds(context);
  return {
    projectIds: accessibleProjects.projectIds,
  };
}

function requireManageFinance(context: GraphQLContext) {
  requirePermission(context, PERMISSION.MANAGE_PLATFORM_FINANCE_RATES);
}

function requireFinanceReportingAccess(context: GraphQLContext) {
  const user = requireCurrentUser(context);
  if (user.isSuperAdmin) {
    return user;
  }
  const allowed: (typeof PERMISSION)[keyof typeof PERMISSION][] = [
    PERMISSION.VIEW_PLATFORM_COST_REPORTS,
    PERMISSION.VIEW_DEPARTMENT_COST_REPORTS,
    PERMISSION.VIEW_DEPARTMENT_RESOURCE_UTILIZATION,
  ];
  if (allowed.some((permission) => hasPermission(user.permissions, permission))) {
    return user;
  }
  throw new AppError('Forbidden', 403);
}

function auditFinanceMutation(
  context: GraphQLContext,
  action: string,
  metadata?: Record<string, unknown>
): void {
  const userId = context.currentUser?.userId;
  if (!userId) {
    return;
  }

  recordAuditLogEntry({
    action,
    ip: getRequestClientIp(context.req),
    metadata,
    result: 'success',
    userId,
  });
}

export const financeModule = createModule({
  id: 'finance',
  typeDefs: gql`
    type FinanceGlobalSettingsGql {
      defaultHourlyRate: Float!
      defaultCurrency: String!
    }

    type FinanceUserRateGql {
      id: ID!
      userId: ID!
      hourlyRate: Float!
      currency: String!
      effectiveFrom: DateTime!
      effectiveTo: DateTime
      createdAt: DateTime!
      updatedAt: DateTime!
    }

    enum FinanceScopeTypeGql {
      PROJECT
      TASK
      SPRINT
      SPRINT_REPO
    }

    type FinanceScopeOverrideGql {
      id: ID!
      scopeType: FinanceScopeTypeGql!
      scopeId: String!
      hourlyRate: Float!
      currency: String!
      createdAt: DateTime!
      updatedAt: DateTime!
    }

    type FinanceRoleRateGql {
      id: ID!
      roleKey: String!
      department: String
      hourlyRate: Float!
      currency: String!
      createdAt: DateTime!
      updatedAt: DateTime!
    }

    enum FinanceLineItemKindGql {
      FIXED_FEE
      MONTHLY_LICENSE
      OTHER
    }

    type FinanceLineItemGql {
      id: ID!
      projectId: ID!
      sprintRepoId: ID
      sprintId: ID
      kind: FinanceLineItemKindGql!
      label: String!
      amount: Float!
      currency: String!
      isActive: Boolean!
      createdAt: DateTime!
      updatedAt: DateTime!
    }

    type CostReportTaskGql {
      taskId: ID!
      title: String!
      hours: Float!
      hourlyRate: Float!
      rateSource: String!
      cost: Float!
    }

    type CostReportProjectGql {
      projectId: ID!
      projectName: String!
      currency: String!
      budgetAllocated: Float!
      hoursCost: Float!
      lineItemsCost: Float!
      totalCost: Float!
      tasks: [CostReportTaskGql!]!
    }

    type CostReportResultGql {
      projects: [CostReportProjectGql!]!
    }

    input UpsertFinanceGlobalSettingsInput {
      defaultHourlyRate: Float!
      defaultCurrency: String!
    }

    input UpsertFinanceUserRateInput {
      id: ID
      userId: ID!
      hourlyRate: Float!
      currency: String!
      effectiveFrom: DateTime!
      effectiveTo: DateTime
    }

    input UpsertFinanceScopeOverrideInput {
      id: ID
      scopeType: FinanceScopeTypeGql!
      scopeId: String!
      hourlyRate: Float!
      currency: String!
    }

    input UpsertFinanceRoleRateInput {
      id: ID
      roleKey: String!
      department: String
      hourlyRate: Float!
      currency: String!
    }

    input UpsertFinanceLineItemInput {
      id: ID
      projectId: ID!
      sprintRepoId: ID
      sprintId: ID
      kind: FinanceLineItemKindGql!
      label: String!
      amount: Float!
      currency: String!
      isActive: Boolean
    }

    input CostReportInput {
      projectIds: [ID!]
      taskIds: [ID!]
      sprintIds: [ID!]
      sprintRepoIds: [ID!]
      asOf: DateTime
    }

    extend type Query {
      financeGlobalSettings: FinanceGlobalSettingsGql!
      financeUserRates(limit: Int = 50, offset: Int = 0): [FinanceUserRateGql!]!
      financeScopeOverrides: [FinanceScopeOverrideGql!]!
      financeRoleRates: [FinanceRoleRateGql!]!
      financeLineItems(projectId: ID!): [FinanceLineItemGql!]!
      costReport(input: CostReportInput!): CostReportResultGql!
    }

    extend type Mutation {
      upsertFinanceGlobalSettings(input: UpsertFinanceGlobalSettingsInput!): FinanceGlobalSettingsGql!
      upsertFinanceUserRate(input: UpsertFinanceUserRateInput!): FinanceUserRateGql!
      deleteFinanceUserRate(id: ID!): Boolean!
      upsertFinanceScopeOverride(input: UpsertFinanceScopeOverrideInput!): FinanceScopeOverrideGql!
      deleteFinanceScopeOverride(id: ID!): Boolean!
      upsertFinanceRoleRate(input: UpsertFinanceRoleRateInput!): FinanceRoleRateGql!
      deleteFinanceRoleRate(id: ID!): Boolean!
      upsertFinanceLineItem(input: UpsertFinanceLineItemInput!): FinanceLineItemGql!
      deleteFinanceLineItem(id: ID!): Boolean!
      recalculateProjectBudgetSpent(projectIds: [ID!]): Boolean!
    }
  `,
  resolvers: {
    Query: {
      financeGlobalSettings: async (_: unknown, __: unknown, context: GraphQLContext) => {
        requireFinanceReportingAccess(context);
        const g = await getOrCreateFinanceGlobalSettings();
        return {
          defaultHourlyRate: g.defaultHourlyRate,
          defaultCurrency: g.defaultCurrency,
        };
      },

      financeUserRates: async (
        _: unknown,
        { limit = 50, offset = 0 }: { limit?: number; offset?: number },
        context: GraphQLContext
      ) => {
        requireFinanceReportingAccess(context);
        const rows = await FinanceUserRate.find({})
          .sort({ updatedAt: -1 })
          .skip(offset)
          .limit(limit)
          .lean();
        return rows.map((row) => ({
          id: row._id.toString(),
          userId: row.userId.toString(),
          hourlyRate: row.hourlyRate,
          currency: row.currency,
          effectiveFrom: row.effectiveFrom,
          effectiveTo: row.effectiveTo,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        }));
      },

      financeScopeOverrides: async (_: unknown, __: unknown, context: GraphQLContext) => {
        requireFinanceReportingAccess(context);
        const rows = await FinanceScopeOverride.find({}).sort({ scopeType: 1, scopeId: 1 }).lean();
        return rows.map((row) => ({
          id: row._id.toString(),
          scopeType: row.scopeType,
          scopeId: row.scopeId,
          hourlyRate: row.hourlyRate,
          currency: row.currency,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        }));
      },

      financeRoleRates: async (_: unknown, __: unknown, context: GraphQLContext) => {
        requireFinanceReportingAccess(context);
        const rows = await FinanceRoleRate.find({}).sort({ roleKey: 1 }).lean();
        return rows.map((row) => ({
          id: row._id.toString(),
          roleKey: row.roleKey,
          department: row.department,
          hourlyRate: row.hourlyRate,
          currency: row.currency,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        }));
      },

      financeLineItems: async (
        _: unknown,
        { projectId }: { projectId: string },
        context: GraphQLContext
      ) => {
        requireFinanceReportingAccess(context);
        await requireProjectAccess(context, projectId);
        const rows = await FinanceLineItem.find({ projectId }).sort({ createdAt: -1 }).lean();
        return rows.map((row) => ({
          id: row._id.toString(),
          projectId: row.projectId.toString(),
          sprintRepoId: row.sprintRepoId ? row.sprintRepoId.toString() : null,
          sprintId: row.sprintId ? row.sprintId.toString() : null,
          kind: row.kind,
          label: row.label,
          amount: row.amount,
          currency: row.currency,
          isActive: row.isActive,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        }));
      },

      costReport: async (
        _: unknown,
        { input }: { input: Record<string, unknown> },
        context: GraphQLContext
      ) => {
        requireFinanceReportingAccess(context);

        const { projectIds } = await getScopedReportingProjectIds(context);
        const filterProjectIds = (input.projectIds as string[] | undefined)?.map(String);
        const filterTaskIds = (input.taskIds as string[] | undefined)?.map(String);
        const filterSprintIds = (input.sprintIds as string[] | undefined)?.map(String);
        const filterSprintRepoIds = (input.sprintRepoIds as string[] | undefined)?.map(String);
        const asOf = input.asOf ? new Date(String(input.asOf)) : new Date();

        if (filterProjectIds && filterProjectIds.length > 0 && projectIds) {
          const allowed = new Set(projectIds);
          for (const pid of filterProjectIds) {
            if (!allowed.has(pid)) {
              throw new AppError('Forbidden for one or more projects', 403);
            }
          }
        }

        if (filterProjectIds && filterProjectIds.length > 0) {
          for (const pid of filterProjectIds) {
            await requireProjectAccess(context, pid);
          }
        }

        const projects = await computeCostReport({
          allowedProjectIds: projectIds,
          filterProjectIds,
          filterTaskIds,
          filterSprintIds,
          filterSprintRepoIds,
          asOf,
        });

        return {
          projects: projects.map((p) => ({
            projectId: p.projectId,
            projectName: p.projectName,
            currency: p.currency,
            budgetAllocated: p.budgetAllocated,
            hoursCost: p.hoursCost,
            lineItemsCost: p.lineItemsCost,
            totalCost: p.totalCost,
            tasks: p.tasks.map((t) => ({
              taskId: t.taskId,
              title: t.title,
              hours: t.hours,
              hourlyRate: t.hourlyRate,
              rateSource: t.rateSource,
              cost: t.cost,
            })),
          })),
        };
      },
    },

    Mutation: {
      upsertFinanceGlobalSettings: async (
        _: unknown,
        { input }: { input: { defaultHourlyRate: number; defaultCurrency: string } },
        context: GraphQLContext
      ) => {
        requireManageFinance(context);
        const doc = await FinanceGlobalSettings.findOneAndUpdate(
          { singletonKey: 'default' },
          {
            $set: {
              defaultHourlyRate: input.defaultHourlyRate,
              defaultCurrency: input.defaultCurrency.trim().toUpperCase(),
            },
          },
          { upsert: true, new: true }
        ).lean();

        if (!doc) {
          throw new AppError('Failed to save finance global settings', 500);
        }

        await triggerBudgetSpentRecalculation();

        auditFinanceMutation(context, 'finance_upsert_global_settings', {
          defaultCurrency: doc.defaultCurrency,
        });

        return {
          defaultHourlyRate: doc.defaultHourlyRate,
          defaultCurrency: doc.defaultCurrency,
        };
      },

      upsertFinanceUserRate: async (
        _: unknown,
        { input }: { input: Record<string, unknown> },
        context: GraphQLContext
      ) => {
        requireManageFinance(context);
        const userId = new mongoose.Types.ObjectId(String(input.userId));
        const payload = {
          userId,
          hourlyRate: Number(input.hourlyRate),
          currency: String(input.currency).trim().toUpperCase(),
          effectiveFrom: new Date(String(input.effectiveFrom)),
          effectiveTo: input.effectiveTo ? new Date(String(input.effectiveTo)) : undefined,
        };

        let saved;
        if (input.id) {
          saved = await FinanceUserRate.findByIdAndUpdate(input.id, payload, { new: true }).lean();
        } else {
          const created = await FinanceUserRate.create(payload);
          saved = created.toObject();
        }

        if (!saved || !saved._id) {
          throw new AppError('Failed to save user rate', 500);
        }

        await triggerBudgetSpentRecalculation();

        auditFinanceMutation(context, 'finance_upsert_user_rate', {
          rateId: saved._id.toString(),
          targetUserId: saved.userId.toString(),
        });

        return {
          id: saved._id.toString(),
          userId: saved.userId.toString(),
          hourlyRate: saved.hourlyRate,
          currency: saved.currency,
          effectiveFrom: saved.effectiveFrom,
          effectiveTo: saved.effectiveTo,
          createdAt: saved.createdAt,
          updatedAt: saved.updatedAt,
        };
      },

      deleteFinanceUserRate: async (_: unknown, { id }: { id: string }, context: GraphQLContext) => {
        requireManageFinance(context);
        await FinanceUserRate.findByIdAndDelete(id);
        await triggerBudgetSpentRecalculation();
        auditFinanceMutation(context, 'finance_delete_user_rate', { id });
        return true;
      },

      upsertFinanceScopeOverride: async (
        _: unknown,
        { input }: { input: Record<string, unknown> },
        context: GraphQLContext
      ) => {
        requireManageFinance(context);
        const scopeType = String(input.scopeType) as FinanceScopeType;
        const scopeId = String(input.scopeId).trim();
        const payload = {
          scopeType,
          scopeId,
          hourlyRate: Number(input.hourlyRate),
          currency: String(input.currency).trim().toUpperCase(),
        };

        let doc;
        if (input.id) {
          doc = await FinanceScopeOverride.findByIdAndUpdate(input.id, payload, { new: true }).lean();
        } else {
          doc = await FinanceScopeOverride.findOneAndUpdate(
            { scopeType, scopeId },
            { $set: payload },
            { upsert: true, new: true }
          ).lean();
        }

        if (!doc) {
          throw new AppError('Failed to save scope override', 500);
        }

        await triggerBudgetSpentRecalculation();

        auditFinanceMutation(context, 'finance_upsert_scope_override', {
          scopeId: doc.scopeId,
          scopeType: doc.scopeType,
        });

        return {
          id: doc._id.toString(),
          scopeType: doc.scopeType,
          scopeId: doc.scopeId,
          hourlyRate: doc.hourlyRate,
          currency: doc.currency,
          createdAt: doc.createdAt,
          updatedAt: doc.updatedAt,
        };
      },

      deleteFinanceScopeOverride: async (_: unknown, { id }: { id: string }, context: GraphQLContext) => {
        requireManageFinance(context);
        await FinanceScopeOverride.findByIdAndDelete(id);
        await triggerBudgetSpentRecalculation();
        auditFinanceMutation(context, 'finance_delete_scope_override', { id });
        return true;
      },

      upsertFinanceRoleRate: async (
        _: unknown,
        { input }: { input: Record<string, unknown> },
        context: GraphQLContext
      ) => {
        requireManageFinance(context);
        const roleKey = normalizeRoleKey(String(input.roleKey));
        const department = input.department ? String(input.department).trim() : '';
        const departmentNormalized = department.toLowerCase();

        const payload = {
          roleKey,
          department: department || undefined,
          departmentNormalized,
          hourlyRate: Number(input.hourlyRate),
          currency: String(input.currency).trim().toUpperCase(),
        };

        let doc;
        if (input.id) {
          doc = await FinanceRoleRate.findByIdAndUpdate(input.id, payload, { new: true }).lean();
        } else {
          doc = await FinanceRoleRate.findOneAndUpdate(
            { roleKey, departmentNormalized },
            { $set: payload },
            { upsert: true, new: true }
          ).lean();
        }

        if (!doc) {
          throw new AppError('Failed to save role rate', 500);
        }

        await triggerBudgetSpentRecalculation();

        auditFinanceMutation(context, 'finance_upsert_role_rate', {
          department: doc.department,
          roleKey: doc.roleKey,
        });

        return {
          id: doc._id.toString(),
          roleKey: doc.roleKey,
          department: doc.department,
          hourlyRate: doc.hourlyRate,
          currency: doc.currency,
          createdAt: doc.createdAt,
          updatedAt: doc.updatedAt,
        };
      },

      deleteFinanceRoleRate: async (_: unknown, { id }: { id: string }, context: GraphQLContext) => {
        requireManageFinance(context);
        await FinanceRoleRate.findByIdAndDelete(id);
        await triggerBudgetSpentRecalculation();
        auditFinanceMutation(context, 'finance_delete_role_rate', { id });
        return true;
      },

      upsertFinanceLineItem: async (
        _: unknown,
        { input }: { input: Record<string, unknown> },
        context: GraphQLContext
      ) => {
        requireManageFinance(context);
        const projectId = String(input.projectId);
        await requireProjectAccess(context, projectId);

        const payload: Record<string, unknown> = {
          projectId: new mongoose.Types.ObjectId(projectId),
          kind: String(input.kind),
          label: String(input.label).trim(),
          amount: Number(input.amount),
          currency: String(input.currency).trim().toUpperCase(),
          isActive: input.isActive !== false,
        };

        if (input.sprintRepoId) {
          payload.sprintRepoId = new mongoose.Types.ObjectId(String(input.sprintRepoId));
        }
        if (input.sprintId) {
          payload.sprintId = new mongoose.Types.ObjectId(String(input.sprintId));
        }

        let saved;
        if (input.id) {
          saved = await FinanceLineItem.findByIdAndUpdate(input.id, payload, { new: true }).lean();
        } else {
          const created = await FinanceLineItem.create(payload);
          saved = created.toObject();
        }

        if (!saved || !saved._id) {
          throw new AppError('Failed to save line item', 500);
        }

        await persistProjectBudgetSpent(projectId);

        auditFinanceMutation(context, 'finance_upsert_line_item', {
          kind: saved.kind,
          projectId,
        });

        return {
          id: saved._id.toString(),
          projectId: saved.projectId.toString(),
          sprintRepoId: saved.sprintRepoId ? saved.sprintRepoId.toString() : null,
          sprintId: saved.sprintId ? saved.sprintId.toString() : null,
          kind: saved.kind,
          label: saved.label,
          amount: saved.amount,
          currency: saved.currency,
          isActive: saved.isActive,
          createdAt: saved.createdAt,
          updatedAt: saved.updatedAt,
        };
      },

      deleteFinanceLineItem: async (_: unknown, { id }: { id: string }, context: GraphQLContext) => {
        requireManageFinance(context);
        const existing = await FinanceLineItem.findById(id).lean();
        if (existing) {
          await requireProjectAccess(context, existing.projectId.toString());
        }
        await FinanceLineItem.findByIdAndDelete(id);
        if (existing) {
          await persistProjectBudgetSpent(existing.projectId.toString());
        }
        auditFinanceMutation(context, 'finance_delete_line_item', { id });
        return true;
      },

      recalculateProjectBudgetSpent: async (
        _: unknown,
        { projectIds }: { projectIds?: string[] },
        context: GraphQLContext
      ) => {
        requireManageFinance(context);
        const ids = projectIds?.map(String) ?? [];
        if (ids.length > 0) {
          for (const pid of ids) {
            await requireProjectAccess(context, pid);
          }
        }
        await recalculateBudgetSpentForProjects(ids.length > 0 ? ids : undefined);
        auditFinanceMutation(context, 'finance_recalculate_budget_spent', {
          projectIdsCount: ids.length,
        });
        return true;
      },
    },
  },
});
