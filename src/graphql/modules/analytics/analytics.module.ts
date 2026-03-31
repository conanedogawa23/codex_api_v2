import { createModule, gql } from 'graphql-modules';
import mongoose from 'mongoose';
import { Task } from '../../../models/Task';
import { Project } from '../../../models/Project';
import { Sprint } from '../../../models/Sprint';
import { Pipeline } from '../../../models/Pipeline';
import { User } from '../../../models/User';
import { AppError } from '../../../middleware';
import { GraphQLContext, requireCurrentUser } from '../../../utils/auth';
import { ACCESS_ROLE, normalizeAccessRole, PERMISSION } from '../../../utils/accessControl';
import { logger } from '../../../utils/logger';
import {
  getContextAccessibleProjectIds,
  requirePermission,
  requireProjectAccess,
  withSprintRepoFilter,
} from '../../../utils/rbac';
import {
  buildMixedIdValues,
  buildTaskScopeFilter,
  getUniqueSprintRepoProjectMappings,
} from '../../../utils/taskProjectScope';

type AnalyticsDepartmentMemberUser = {
  _id: { toString(): string };
  gitlabId?: number | null;
  name?: string | null;
  email?: string | null;
  department?: string | null;
  role?: string | null;
  isActive?: boolean;
  userSource?: string;
  userType?: string;
};

type DepartmentResourceUser = {
  userId: string;
  aliasIds: string[];
  userName: string;
  email: string;
  department: string;
  jobRole: string;
};

const ACTIVE_HUMAN_ANALYTICS_MEMBER_FILTER = {
  isActive: true,
  $or: [
    { userType: 'human' },
    { userType: { $exists: false }, userSource: 'manual' },
  ],
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildDepartmentMemberAliases(user: AnalyticsDepartmentMemberUser): string[] {
  const aliases = [user._id.toString()];

  if (user.gitlabId !== undefined && user.gitlabId !== null) {
    aliases.push(user.gitlabId.toString());
  }

  return aliases;
}

function isEligibleAnalyticsDepartmentMember(
  user: AnalyticsDepartmentMemberUser | null | undefined
): user is AnalyticsDepartmentMemberUser {
  if (!user || user.isActive === false) {
    return false;
  }

  if (user.userType) {
    return user.userType === 'human';
  }

  return user.userSource === 'manual';
}

async function resolveDepartmentResourceUsers(
  departmentName: string
): Promise<DepartmentResourceUser[]> {
  const normalizedDepartment = departmentName.trim();
  if (!normalizedDepartment) {
    return [];
  }

  const users = await User.find({
    department: normalizedDepartment,
    ...ACTIVE_HUMAN_ANALYTICS_MEMBER_FILTER,
  })
    .select('_id gitlabId name email department role isActive userSource userType')
    .lean();

  return users
    .filter(isEligibleAnalyticsDepartmentMember)
    .map((user) => ({
      userId: user._id.toString(),
      aliasIds: buildDepartmentMemberAliases(user),
      userName: user.name?.trim() || user.email?.trim() || user._id.toString(),
      email: user.email?.trim() || '',
      department: user.department?.trim() || normalizedDepartment,
      jobRole: user.role?.trim() || 'Not set',
    }))
    .sort((left, right) => left.userName.localeCompare(right.userName));
}

async function getScopedProjectIds(
  context: GraphQLContext,
  projectId?: string
): Promise<string[] | null> {
  const currentUser = requireCurrentUser(context);

  if (projectId) {
    await requireProjectAccess(context, projectId);
    return [projectId];
  }

  if (currentUser.isSuperAdmin) {
    return null;
  }

  const accessibleProjects = await getContextAccessibleProjectIds(context);
  return accessibleProjects.projectIds;
}

async function getScopedReportingProjectIds(
  context: GraphQLContext,
  projectId?: string
): Promise<{ projectIds: string[] | null; accessRole: string; department: string }> {
  const currentUser = requireCurrentUser(context);
  const accessRole = normalizeAccessRole(currentUser.accessRole);

  if (currentUser.isSuperAdmin || accessRole === ACCESS_ROLE.FINANCE) {
    return {
      projectIds: projectId ? [projectId] : null,
      accessRole,
      department: currentUser.department,
    };
  }

  requirePermission(context, PERMISSION.VIEW_DEPARTMENT_RESOURCE_UTILIZATION);

  if (projectId) {
    await requireProjectAccess(context, projectId);
    return {
      projectIds: [projectId],
      accessRole,
      department: currentUser.department,
    };
  }

  const accessibleProjects = await getContextAccessibleProjectIds(context);
  return {
    projectIds: accessibleProjects.projectIds,
    accessRole,
    department: currentUser.department,
  };
}

function createEmptyTaskStatusAnalytics() {
  return {
    overview: [] as Array<{ status: string; count: number }>,
    distribution: [] as Array<{ name: string; value: number; color: string }>,
    byPriority: [] as Array<{ priority: string; count: number }>,
    byAssignee: [] as Array<{
      assigneeId: string;
      assigneeName: string;
      count: number;
      completed: number;
      inProgress: number;
      pending: number;
    }>,
  };
}

function createEmptyResourceAllocationAnalytics() {
  return {
    hoursLoggedByResource: [] as Array<{ userId: string; userName: string; totalHours: number }>,
    allocationStatus: [] as Array<{ status: string; count: number; percentage: number }>,
    resources: [] as Array<{
      userId: string;
      userName: string;
      email: string;
      department: string;
      jobRole: string;
      totalTasks: number;
      completedTasks: number;
      totalHours: number;
      actualHours: number;
    }>,
    highUtilizationCount: 0,
    totalHoursLogged: 0,
    totalCount: 0,
  };
}

async function buildScopedTaskMatch(projectIds: string[] | null): Promise<Record<string, unknown> | null> {
  if (projectIds === null) {
    return null;
  }

  const sprintRepoMappings = await getUniqueSprintRepoProjectMappings(projectIds);
  return buildTaskScopeFilter(
    projectIds,
    sprintRepoMappings.map((mapping) => mapping.sprintRepoId)
  );
}

function mergeProjectTaskStats(
  statsByProject: Map<string, { total: number; completed: number; estimatedHours: number; actualHours: number }>,
  projectId: string,
  stats: { total: number; completed: number; estimatedHours: number; actualHours: number }
) {
  const existingStats = statsByProject.get(projectId) || {
    total: 0,
    completed: 0,
    estimatedHours: 0,
    actualHours: 0,
  };

  existingStats.total += stats.total;
  existingStats.completed += stats.completed;
  existingStats.estimatedHours += stats.estimatedHours;
  existingStats.actualHours += stats.actualHours;

  statsByProject.set(projectId, existingStats);
}

export const analyticsModule = createModule({
  id: 'analytics',
  typeDefs: gql`
    type StatusCount {
      status: String!
      count: Int!
    }

    type StatusDistribution {
      name: String!
      value: Int!
      color: String!
    }

    type PriorityCount {
      priority: String!
      count: Int!
    }

    type AssigneeTaskCount {
      assigneeId: String!
      assigneeName: String!
      count: Int!
      completed: Int!
      inProgress: Int!
      pending: Int!
    }

    type TaskStatusAnalytics {
      overview: [StatusCount!]!
      distribution: [StatusDistribution!]!
      byPriority: [PriorityCount!]!
      byAssignee: [AssigneeTaskCount!]!
    }

    type SprintVelocity {
      sprintId: String!
      sprintName: String!
      committed: Int!
      completed: Int!
      completionRate: Float!
    }

    type SprintVelocityAnalytics {
      sprints: [SprintVelocity!]!
      averageCommitted: Float!
      averageCompleted: Float!
      completionRate: Float!
      trend: String!
    }

    type ResourceHours {
      userId: String!
      userName: String!
      totalHours: Float!
    }

    type AllocationStatus {
      status: String!
      count: Int!
      percentage: Float!
    }

    type ResourceDetail {
      userId: String!
      userName: String!
      email: String!
      department: String!
      jobRole: String!
      totalTasks: Int!
      completedTasks: Int!
      totalHours: Float!
      actualHours: Float!
    }

    type ResourceAllocationAnalytics {
      hoursLoggedByResource: [ResourceHours!]!
      allocationStatus: [AllocationStatus!]!
      resources: [ResourceDetail!]!
      highUtilizationCount: Int!
      totalHoursLogged: Float!
      totalCount: Int!
    }

    type ProjectCompletion {
      projectId: String!
      projectName: String!
      completion: Float!
      tasksCompleted: Int!
      tasksTotal: Int!
      budgetAllocated: Float!
    }

    type TimeComparison {
      projectId: String!
      projectName: String!
      estimatedHours: Float!
      actualHours: Float!
      variance: Float!
      budgetAllocated: Float!
    }

    type ProjectDetail {
      projectId: String!
      projectName: String!
      status: String!
      progress: Int!
      tasksTotal: Int!
      tasksCompleted: Int!
      estimatedHours: Float!
      actualHours: Float!
      budgetAllocated: Float!
    }

    type ProjectProgressAnalytics {
      completionData: [ProjectCompletion!]!
      timeComparison: [TimeComparison!]!
      projects: [ProjectDetail!]!
      totalCount: Int!
    }

    type PipelineStatusCount {
      status: String!
      count: Int!
    }

    type PipelineAnalytics {
      successRate: Float!
      totalPipelines: Int!
      byStatus: [PipelineStatusCount!]!
    }

    extend type Query {
      taskStatusAnalytics(projectId: String, sprintId: String): TaskStatusAnalytics!
      sprintVelocityAnalytics(sprintRepoId: String, limit: Int): SprintVelocityAnalytics!
      resourceAllocationAnalytics(projectId: String, limit: Int = 20, offset: Int = 0, search: String): ResourceAllocationAnalytics!
      projectProgressAnalytics(limit: Int = 20, offset: Int = 0, search: String, budgetOnly: Boolean = false): ProjectProgressAnalytics!
      pipelineAnalytics(projectId: String): PipelineAnalytics!
    }
  `,
  resolvers: {
    Query: {
      taskStatusAnalytics: async (
        _: any,
        { projectId, sprintId }: { projectId?: string; sprintId?: string },
        context: GraphQLContext
      ) => {
        try {
          const emptyAnalytics = createEmptyTaskStatusAnalytics();
          const filter: any = { isActive: true };
          const scopedProjectIds = await getScopedProjectIds(context, projectId);
          if (scopedProjectIds && scopedProjectIds.length === 0) {
            return emptyAnalytics;
          }

          const scopedTaskMatch = await buildScopedTaskMatch(scopedProjectIds);
          if (scopedTaskMatch) {
            Object.assign(filter, scopedTaskMatch);
          }
          if (sprintId) filter.sprintId = sprintId;

          const statusCounts = await Task.aggregate([
            { $match: filter },
            {
              $group: {
                _id: '$status',
                count: { $sum: 1 }
              }
            }
          ]);

          const priorityCounts = await Task.aggregate([
            { $match: filter },
            {
              $group: {
                _id: '$priority',
                count: { $sum: 1 }
              }
            }
          ]);

          const assigneeCounts = await Task.aggregate([
            { $match: { ...filter, 'assignedTo.id': { $exists: true, $ne: null } } },
            {
              $group: {
                _id: '$assignedTo.id',
                assigneeName: { $first: '$assignedTo.name' },
                count: { $sum: 1 },
                completed: {
                  $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
                },
                inProgress: {
                  $sum: { $cond: [{ $eq: ['$status', 'in-progress'] }, 1, 0] }
                },
                pending: {
                  $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
                }
              }
            },
            { $sort: { count: -1 } },
            { $limit: 20 }
          ]);

          const statusColorMap: Record<string, string> = {
            'pending': '#94a3b8',
            'in-progress': '#3b82f6',
            'completed': '#10b981',
            'delayed': '#f59e0b',
            'cancelled': '#ef4444'
          };

          const overview = statusCounts.map((item: any) => ({
            status: item._id,
            count: item.count
          }));

          const distribution = statusCounts.map((item: any) => ({
            name: item._id.charAt(0).toUpperCase() + item._id.slice(1).replace('-', ' '),
            value: item.count,
            color: statusColorMap[item._id] || '#94a3b8'
          }));

          const byPriority = priorityCounts.map((item: any) => ({
            priority: item._id,
            count: item.count
          }));

          const byAssignee = assigneeCounts.map((item: any) => ({
            assigneeId: item._id,
            assigneeName: item.assigneeName,
            count: item.count,
            completed: item.completed,
            inProgress: item.inProgress,
            pending: item.pending
          }));

          logger.info('Task status analytics generated', { projectId, sprintId });

          return {
            overview,
            distribution,
            byPriority,
            byAssignee
          };
        } catch (error) {
          logger.error('Error generating task status analytics', { error, projectId, sprintId });
          throw new AppError('Failed to generate task status analytics', 500);
        }
      },

      sprintVelocityAnalytics: async (
        _: any,
        { sprintRepoId, limit = 10 }: { sprintRepoId?: string; limit: number },
        context: GraphQLContext
      ) => {
        try {
          requireCurrentUser(context);
          const filter: any = { isActive: true };
          if (sprintRepoId) {
            filter.sprintRepoId = mongoose.Types.ObjectId.isValid(sprintRepoId) 
              ? new mongoose.Types.ObjectId(sprintRepoId)
              : sprintRepoId;
          }

          const scopedFilter = await withSprintRepoFilter(context, filter, 'sprintRepoId');

          const sprints = await Sprint.find(scopedFilter)
            .sort({ startDate: -1 })
            .limit(limit)
            .lean();

          const sprintVelocities = await Promise.all(
            sprints.map(async (sprint: any) => {
              const sprintId = sprint._id.toString();
              
              const tasks = await Task.find({
                sprintId: { $in: [sprintId, sprint._id] },
                isActive: true
              }).lean();

              const committed = tasks.length;
              const completed = tasks.filter((t: any) => t.status === 'completed').length;
              const completionRate = committed > 0 ? (completed / committed) * 100 : 0;

              return {
                sprintId,
                sprintName: sprint.name,
                committed,
                completed,
                completionRate
              };
            })
          );

          const totalCommitted = sprintVelocities.reduce((sum, sv) => sum + sv.committed, 0);
          const totalCompleted = sprintVelocities.reduce((sum, sv) => sum + sv.completed, 0);
          const averageCommitted = sprintVelocities.length > 0 ? totalCommitted / sprintVelocities.length : 0;
          const averageCompleted = sprintVelocities.length > 0 ? totalCompleted / sprintVelocities.length : 0;
          const completionRate = totalCommitted > 0 ? (totalCompleted / totalCommitted) * 100 : 0;

          let trend = 'stable';
          if (sprintVelocities.length >= 2) {
            const recent = sprintVelocities[0].completionRate;
            const previous = sprintVelocities[1].completionRate;
            if (recent > previous + 5) trend = 'improving';
            else if (recent < previous - 5) trend = 'declining';
          }

          logger.info('Sprint velocity analytics generated', { sprintRepoId, sprintCount: sprints.length });

          return {
            sprints: sprintVelocities,
            averageCommitted,
            averageCompleted,
            completionRate,
            trend
          };
        } catch (error) {
          logger.error('Error generating sprint velocity analytics', { error, sprintRepoId });
          throw new AppError('Failed to generate sprint velocity analytics', 500);
        }
      },

      resourceAllocationAnalytics: async (
        _: any,
        { projectId, limit = 20, offset = 0, search }: { projectId?: string; limit?: number; offset?: number; search?: string },
        context: GraphQLContext
      ) => {
        try {
          const currentUser = requireCurrentUser(context);
          const { projectIds, accessRole, department } = await getScopedReportingProjectIds(
            context,
            projectId
          );
          if (projectIds && projectIds.length === 0) {
            return createEmptyResourceAllocationAnalytics();
          }

          const trimmedSearch = search?.trim();
          const useDepartmentResourceScope =
            !projectId &&
            !currentUser.isSuperAdmin &&
            accessRole === ACCESS_ROLE.CLUSTER_SUPER_ADMIN;

          let resourceDetails: any[] = [];
          let allocationAggregation: any[] = [];

          if (useDepartmentResourceScope) {
            const departmentUsers = await resolveDepartmentResourceUsers(department);
            if (departmentUsers.length === 0) {
              return createEmptyResourceAllocationAnalytics();
            }

            const scopedTaskMatch = await buildScopedTaskMatch(projectIds);
            const memberAliasIds = Array.from(
              new Set(departmentUsers.flatMap((user) => user.aliasIds))
            );
            const memberAliasValues = buildMixedIdValues(memberAliasIds);
            const aliasToUser = new Map<string, DepartmentResourceUser>();
            const userById = new Map<string, DepartmentResourceUser>();

            departmentUsers.forEach((user) => {
              userById.set(user.userId, user);
              user.aliasIds.forEach((alias) => aliasToUser.set(alias, user));
            });

            const rawResourceDetails = await Task.aggregate([
              {
                $match: {
                  isActive: true,
                  'assignedTo.id': { $in: memberAliasValues },
                  ...(scopedTaskMatch || {}),
                },
              },
              {
                $group: {
                  _id: '$assignedTo.id',
                  totalTasks: { $sum: 1 },
                  completedTasks: {
                    $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
                  },
                  totalHours: {
                    $sum: { $ifNull: ['$estimatedHours', 0] },
                  },
                  actualHours: {
                    $sum: { $ifNull: ['$actualHours', 0] },
                  },
                },
              },
            ]);

            const metricsByUserId = new Map<
              string,
              {
                totalTasks: number;
                completedTasks: number;
                totalHours: number;
                actualHours: number;
              }
            >();

            rawResourceDetails.forEach((item: any) => {
              const member = aliasToUser.get(String(item._id));
              if (!member) {
                return;
              }

              const existing = metricsByUserId.get(member.userId) || {
                totalTasks: 0,
                completedTasks: 0,
                totalHours: 0,
                actualHours: 0,
              };

              existing.totalTasks += item.totalTasks || 0;
              existing.completedTasks += item.completedTasks || 0;
              existing.totalHours += item.totalHours || 0;
              existing.actualHours += item.actualHours || 0;
              metricsByUserId.set(member.userId, existing);
            });

            resourceDetails = departmentUsers.map((user) => {
              const metrics = metricsByUserId.get(user.userId) || {
                totalTasks: 0,
                completedTasks: 0,
                totalHours: 0,
                actualHours: 0,
              };

              return {
                userId: user.userId,
                userName: user.userName,
                email: user.email,
                department: user.department,
                jobRole: user.jobRole,
                totalTasks: metrics.totalTasks,
                completedTasks: metrics.completedTasks,
                totalHours: metrics.totalHours,
                actualHours: metrics.actualHours,
              };
            });

            if (trimmedSearch) {
              const normalizedSearch = trimmedSearch.toLowerCase();
              resourceDetails = resourceDetails.filter((item: any) =>
                [item.userName, item.email, item.department, item.jobRole]
                  .some((value) => String(value || '').toLowerCase().includes(normalizedSearch))
              );
            }

            resourceDetails.sort(
              (left, right) => right.totalTasks - left.totalTasks || left.userName.localeCompare(right.userName)
            );

            if (resourceDetails.length > 0) {
              const filteredAliasIds = Array.from(
                new Set(
                  resourceDetails.flatMap((item: any) => userById.get(item.userId)?.aliasIds || [])
                )
              );

              allocationAggregation = await Task.aggregate([
                {
                  $match: {
                    isActive: true,
                    'assignedTo.id': { $in: buildMixedIdValues(filteredAliasIds) },
                    ...(scopedTaskMatch || {}),
                  },
                },
                {
                  $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                  },
                },
              ]);
            }
          } else {
            const taskMatch: any = {
              isActive: true,
              'assignedTo.id': { $exists: true, $ne: null },
            };

            const scopedTaskMatch = await buildScopedTaskMatch(projectIds);
            if (scopedTaskMatch) {
              Object.assign(taskMatch, scopedTaskMatch);
            }

            const resourcePipeline: any[] = [
              { $match: taskMatch },
              {
                $group: {
                  _id: '$assignedTo.id',
                  userName: { $first: '$assignedTo.name' },
                  email: { $first: '$assignedTo.email' },
                  totalTasks: { $sum: 1 },
                  completedTasks: {
                    $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
                  },
                  totalHours: {
                    $sum: { $ifNull: ['$estimatedHours', 0] },
                  },
                  actualHours: {
                    $sum: { $ifNull: ['$actualHours', 0] },
                  },
                },
              },
              {
                $lookup: {
                  from: 'users',
                  let: { assignedUserId: '$_id' },
                  pipeline: [
                    {
                      $match: {
                        $expr: {
                          $or: [
                            { $eq: [{ $toString: '$_id' }, '$$assignedUserId'] },
                            { $eq: [{ $toString: '$gitlabId' }, '$$assignedUserId'] },
                          ],
                        },
                      },
                    },
                    {
                      $project: {
                        department: 1,
                        role: 1,
                      },
                    },
                  ],
                  as: 'userInfo',
                },
              },
              {
                $addFields: {
                  userId: '$_id',
                  department: {
                    $ifNull: [{ $arrayElemAt: ['$userInfo.department', 0] }, 'Unknown'],
                  },
                  jobRole: {
                    $ifNull: [{ $arrayElemAt: ['$userInfo.role', 0] }, 'Not set'],
                  },
                },
              },
            ];

            if (trimmedSearch) {
              const escapedSearch = escapeRegex(trimmedSearch);
              resourcePipeline.push({
                $match: {
                  $or: [
                    { userName: { $regex: escapedSearch, $options: 'i' } },
                    { email: { $regex: escapedSearch, $options: 'i' } },
                    { department: { $regex: escapedSearch, $options: 'i' } },
                    { jobRole: { $regex: escapedSearch, $options: 'i' } },
                  ],
                },
              });
            }

            resourcePipeline.push(
              {
                $project: {
                  _id: 0,
                  userId: 1,
                  userName: 1,
                  email: { $ifNull: ['$email', ''] },
                  department: 1,
                  jobRole: 1,
                  totalTasks: 1,
                  completedTasks: 1,
                  totalHours: 1,
                  actualHours: 1,
                },
              },
              { $sort: { totalTasks: -1, userName: 1 } }
            );

            resourceDetails = await Task.aggregate(resourcePipeline);

            if (resourceDetails.length > 0) {
              const allocationMatch: any = { ...taskMatch };

              if (trimmedSearch) {
                allocationMatch['assignedTo.id'] = {
                  $in: resourceDetails.map((item: any) => item.userId),
                };
              }

              allocationAggregation = await Task.aggregate([
                { $match: allocationMatch },
                {
                  $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                  },
                },
              ]);
            }
          }

          const totalCount = resourceDetails.length;
          const paginatedResources = resourceDetails.slice(offset, offset + limit);

          const hoursLoggedByResource = [...resourceDetails]
            .sort((left, right) => right.actualHours - left.actualHours || left.userName.localeCompare(right.userName))
            .slice(0, 20)
            .map((item: any) => ({
              userId: item.userId,
              userName: item.userName,
              totalHours: item.actualHours,
            }));

          const totalTasks = allocationAggregation.reduce((sum: number, item: any) => sum + item.count, 0);
          const allocationStatus = allocationAggregation.map((item: any) => ({
            status: item._id,
            count: item.count,
            percentage: totalTasks > 0 ? (item.count / totalTasks) * 100 : 0,
          }));
          const totalHoursLogged = resourceDetails.reduce(
            (sum: number, item: any) => sum + item.actualHours,
            0
          );
          const highUtilizationCount = resourceDetails.filter((item: any) => {
            const utilizationRate = item.totalHours > 0 ? (item.actualHours / item.totalHours) * 100 : 0;
            return utilizationRate > 80;
          }).length;

          logger.info('Resource allocation analytics generated', {
            projectId,
            returnedCount: paginatedResources.length,
            search: trimmedSearch,
            totalCount,
          });

          return {
            hoursLoggedByResource,
            allocationStatus,
            highUtilizationCount,
            resources: paginatedResources.map((item: any) => ({
              userId: item.userId,
              userName: item.userName,
              email: item.email,
              department: item.department,
              jobRole: item.jobRole,
              totalTasks: item.totalTasks,
              completedTasks: item.completedTasks,
              totalHours: item.totalHours,
              actualHours: item.actualHours,
            })),
            totalHoursLogged,
            totalCount,
          };
        } catch (error) {
          logger.error('Error generating resource allocation analytics', { error, projectId, search });
          throw new AppError('Failed to generate resource allocation analytics', 500);
        }
      },

      projectProgressAnalytics: async (
        _: any,
        { limit = 20, offset = 0, search, budgetOnly = false }: { limit?: number; offset?: number; search?: string; budgetOnly?: boolean },
        context: GraphQLContext
      ) => {
        try {
          const projectFilter: any = { isActive: true };
          const { projectIds } = await getScopedReportingProjectIds(context);
          const trimmedSearch = search?.trim();

          if (projectIds && projectIds.length === 0) {
            return {
              completionData: [],
              timeComparison: [],
              projects: [],
              totalCount: 0,
            };
          }

          if (projectIds) {
            projectFilter._id = { $in: buildMixedIdValues(projectIds) };
          }

          if (budgetOnly) {
            projectFilter['budget.allocated'] = { $gt: 0 };
          }

          if (trimmedSearch) {
            const escapedSearch = escapeRegex(trimmedSearch);
            projectFilter.$or = [
              { name: { $regex: escapedSearch, $options: 'i' } },
              { nameWithNamespace: { $regex: escapedSearch, $options: 'i' } },
            ];
          }

          const matchingProjects = await Project.find(projectFilter)
            .select('name nameWithNamespace status progress tasks budget lastActivityAt')
            .sort({ lastActivityAt: -1 })
            .lean();

          const matchingProjectIds = matchingProjects.map((project: any) => project._id.toString());
          const directTaskStats = matchingProjectIds.length > 0
            ? await Task.aggregate([
                {
                  $match: {
                    projectId: { $in: buildMixedIdValues(matchingProjectIds) },
                    isActive: true,
                  },
                },
                {
                  $group: {
                    _id: '$projectId',
                    total: { $sum: 1 },
                    completed: {
                      $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
                    },
                    estimatedHours: { $sum: { $ifNull: ['$estimatedHours', 0] } },
                    actualHours: { $sum: { $ifNull: ['$actualHours', 0] } },
                  },
                },
              ])
            : [];

          const taskStatsByProject = new Map<string, {
            total: number;
            completed: number;
            estimatedHours: number;
            actualHours: number;
          }>();

          for (const taskStat of directTaskStats) {
            mergeProjectTaskStats(taskStatsByProject, String(taskStat._id), taskStat);
          }

          const uniqueSprintRepoMappings = await getUniqueSprintRepoProjectMappings(matchingProjectIds);
          if (uniqueSprintRepoMappings.length > 0) {
            const sprintRepoIds = uniqueSprintRepoMappings.map((mapping) => mapping.sprintRepoId);
            const sprintRepoToProjectId = new Map(
              uniqueSprintRepoMappings.map((mapping) => [mapping.sprintRepoId, mapping.projectId])
            );

            const legacyTaskStats = await Task.aggregate([
              {
                $match: {
                  isActive: true,
                  sprintRepoId: { $in: buildMixedIdValues(sprintRepoIds) },
                  projectId: { $nin: buildMixedIdValues(matchingProjectIds) },
                },
              },
              {
                $group: {
                  _id: '$sprintRepoId',
                  total: { $sum: 1 },
                  completed: {
                    $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
                  },
                  estimatedHours: { $sum: { $ifNull: ['$estimatedHours', 0] } },
                  actualHours: { $sum: { $ifNull: ['$actualHours', 0] } },
                },
              },
            ]);

            for (const legacyTaskStat of legacyTaskStats) {
              const projectIdForSprintRepo = sprintRepoToProjectId.get(String(legacyTaskStat._id));
              if (!projectIdForSprintRepo) {
                continue;
              }

              mergeProjectTaskStats(taskStatsByProject, projectIdForSprintRepo, legacyTaskStat);
            }
          }

          const allProjectDetails = matchingProjects.map((project: any) => {
            const projectId = project._id.toString();
            const projectTaskStats = taskStatsByProject.get(projectId) || {
              total: project.tasks?.total || 0,
              completed: project.tasks?.completed || 0,
              estimatedHours: 0,
              actualHours: 0,
            };
            const completion = projectTaskStats.total > 0
              ? (projectTaskStats.completed / projectTaskStats.total) * 100
              : project.progress || 0;

            return {
              projectId,
              projectName: project.name,
              status: project.status || 'planned',
              progress: Math.round(completion),
              tasksTotal: projectTaskStats.total,
              tasksCompleted: projectTaskStats.completed,
              estimatedHours: projectTaskStats.estimatedHours,
              actualHours: projectTaskStats.actualHours,
              budgetAllocated: project.budget?.allocated || 0,
              completion,
            };
          });

          const totalCount = allProjectDetails.length;
          const paginatedProjects = allProjectDetails.slice(offset, offset + limit);
          const completionData = allProjectDetails.map((project: any) => ({
            projectId: project.projectId,
            projectName: project.projectName,
            completion: project.completion,
            tasksCompleted: project.tasksCompleted,
            tasksTotal: project.tasksTotal,
            budgetAllocated: project.budgetAllocated,
          }));
          const timeComparison = allProjectDetails.map((project: any) => ({
            projectId: project.projectId,
            projectName: project.projectName,
            estimatedHours: project.estimatedHours,
            actualHours: project.actualHours,
            variance: project.estimatedHours > 0
              ? ((project.actualHours - project.estimatedHours) / project.estimatedHours) * 100
              : 0,
            budgetAllocated: project.budgetAllocated,
          }));

          logger.info('Project progress analytics generated', {
            budgetOnly,
            returnedCount: paginatedProjects.length,
            search: trimmedSearch,
            totalCount,
          });

          return {
            completionData,
            timeComparison,
            projects: paginatedProjects,
            totalCount,
          };
        } catch (error) {
          logger.error('Error generating project progress analytics', { budgetOnly, error, search });
          throw new AppError('Failed to generate project progress analytics', 500);
        }
      },

      pipelineAnalytics: async (
        _: any,
        { projectId }: { projectId?: string },
        context: GraphQLContext
      ) => {
        try {
          const filter: any = { isDeleted: false };
          const scopedProjectIds = await getScopedProjectIds(context, projectId);
          if (scopedProjectIds && scopedProjectIds.length === 0) {
            return {
              successRate: 0,
              totalPipelines: 0,
              byStatus: [],
            };
          }

          if (scopedProjectIds) {
            filter.projectId = { $in: scopedProjectIds };
          }

          const statusCounts = await Pipeline.aggregate([
            { $match: filter },
            {
              $group: {
                _id: '$status',
                count: { $sum: 1 }
              }
            }
          ]);

          const totalPipelines = statusCounts.reduce((sum: number, item: any) => sum + item.count, 0);
          const successCount = statusCounts.find((item: any) => item._id === 'success')?.count || 0;
          const successRate = totalPipelines > 0 ? (successCount / totalPipelines) * 100 : 0;

          const byStatus = statusCounts.map((item: any) => ({
            status: item._id,
            count: item.count
          }));

          logger.info('Pipeline analytics generated', { projectId, totalPipelines });

          return {
            successRate,
            totalPipelines,
            byStatus
          };
        } catch (error) {
          logger.error('Error generating pipeline analytics', { error, projectId });
          throw new AppError('Failed to generate pipeline analytics', 500);
        }
      }
    }
  }
});
