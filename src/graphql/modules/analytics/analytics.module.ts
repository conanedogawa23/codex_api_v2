import { createModule, gql } from 'graphql-modules';
import mongoose from 'mongoose';
import { Task } from '../../../models/Task';
import { Project } from '../../../models/Project';
import { User } from '../../../models/User';
import { Sprint } from '../../../models/Sprint';
import { Pipeline } from '../../../models/Pipeline';
import { AppError } from '../../../middleware';
import { logger } from '../../../utils/logger';

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
      totalTasks: Int!
      completedTasks: Int!
      totalHours: Float!
      actualHours: Float!
    }

    type ResourceAllocationAnalytics {
      hoursLoggedByResource: [ResourceHours!]!
      allocationStatus: [AllocationStatus!]!
      resources: [ResourceDetail!]!
    }

    type ProjectCompletion {
      projectId: String!
      projectName: String!
      completion: Float!
      tasksCompleted: Int!
      tasksTotal: Int!
    }

    type TimeComparison {
      projectId: String!
      projectName: String!
      estimatedHours: Float!
      actualHours: Float!
      variance: Float!
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
    }

    type ProjectProgressAnalytics {
      completionData: [ProjectCompletion!]!
      timeComparison: [TimeComparison!]!
      projects: [ProjectDetail!]!
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
      resourceAllocationAnalytics(projectId: String): ResourceAllocationAnalytics!
      projectProgressAnalytics(limit: Int): ProjectProgressAnalytics!
      pipelineAnalytics(projectId: String): PipelineAnalytics!
    }
  `,
  resolvers: {
    Query: {
      taskStatusAnalytics: async (_: any, { projectId, sprintId }: { projectId?: string; sprintId?: string }) => {
        try {
          const filter: any = { isActive: true };
          if (projectId) filter.projectId = projectId;
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

      sprintVelocityAnalytics: async (_: any, { sprintRepoId, limit = 10 }: { sprintRepoId?: string; limit: number }) => {
        try {
          const filter: any = { isActive: true };
          if (sprintRepoId) {
            filter.sprintRepoId = mongoose.Types.ObjectId.isValid(sprintRepoId) 
              ? new mongoose.Types.ObjectId(sprintRepoId)
              : sprintRepoId;
          }

          const sprints = await Sprint.find(filter)
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

      resourceAllocationAnalytics: async (_: any, { projectId }: { projectId?: string }) => {
        try {
          const filter: any = { isActive: true, 'assignedTo.id': { $exists: true, $ne: null } };
          if (projectId) filter.projectId = projectId;

          const hoursAggregation = await Task.aggregate([
            { $match: filter },
            {
              $group: {
                _id: '$assignedTo.id',
                userName: { $first: '$assignedTo.name' },
                totalHours: { $sum: { $ifNull: ['$actualHours', 0] } }
              }
            },
            { $sort: { totalHours: -1 } },
            { $limit: 20 }
          ]);

          const allocationAggregation = await Task.aggregate([
            { $match: filter },
            {
              $group: {
                _id: '$status',
                count: { $sum: 1 }
              }
            }
          ]);

          const totalTasks = allocationAggregation.reduce((sum: number, item: any) => sum + item.count, 0);

          const allocationStatus = allocationAggregation.map((item: any) => ({
            status: item._id,
            count: item.count,
            percentage: totalTasks > 0 ? (item.count / totalTasks) * 100 : 0
          }));

          const resourceDetails = await Task.aggregate([
            { $match: filter },
            {
              $group: {
                _id: '$assignedTo.id',
                userName: { $first: '$assignedTo.name' },
                email: { $first: '$assignedTo.email' },
                totalTasks: { $sum: 1 },
                completedTasks: {
                  $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
                },
                totalHours: {
                  $sum: { $ifNull: ['$estimatedHours', 0] }
                },
                actualHours: {
                  $sum: { $ifNull: ['$actualHours', 0] }
                }
              }
            },
            {
              $lookup: {
                from: 'users',
                let: { userId: '$_id' },
                pipeline: [
                  {
                    $match: {
                      $expr: { $eq: [{ $toString: '$_id' }, '$$userId'] }
                    }
                  }
                ],
                as: 'userInfo'
              }
            },
            {
              $project: {
                userId: '$_id',
                userName: 1,
                email: 1,
                department: { $ifNull: [{ $arrayElemAt: ['$userInfo.department', 0] }, 'Unknown'] },
                totalTasks: 1,
                completedTasks: 1,
                totalHours: 1,
                actualHours: 1
              }
            },
            { $sort: { totalTasks: -1 } },
            { $limit: 20 }
          ]);

          logger.info('Resource allocation analytics generated', { projectId });

          return {
            hoursLoggedByResource: hoursAggregation.map((item: any) => ({
              userId: item._id,
              userName: item.userName,
              totalHours: item.totalHours
            })),
            allocationStatus,
            resources: resourceDetails.map((item: any) => ({
              userId: item.userId,
              userName: item.userName,
              email: item.email || '',
              department: item.department,
              totalTasks: item.totalTasks,
              completedTasks: item.completedTasks,
              totalHours: item.totalHours,
              actualHours: item.actualHours
            }))
          };
        } catch (error) {
          logger.error('Error generating resource allocation analytics', { error, projectId });
          throw new AppError('Failed to generate resource allocation analytics', 500);
        }
      },

      projectProgressAnalytics: async (_: any, { limit = 20 }: { limit: number }) => {
        try {
          const projects = await Project.find({ isActive: true })
            .sort({ lastActivityAt: -1 })
            .limit(limit)
            .lean();

          const completionData = projects.map((project: any) => ({
            projectId: project._id.toString(),
            projectName: project.name,
            completion: project.progress || 0,
            tasksCompleted: project.tasks?.completed || 0,
            tasksTotal: project.tasks?.total || 0
          }));

          const timeComparisons = await Promise.all(
            projects.map(async (project: any) => {
              const projectId = project._id.toString();
              
              const tasks = await Task.aggregate([
                {
                  $match: {
                    projectId,
                    isActive: true
                  }
                },
                {
                  $group: {
                    _id: null,
                    estimatedHours: { $sum: { $ifNull: ['$estimatedHours', 0] } },
                    actualHours: { $sum: { $ifNull: ['$actualHours', 0] } }
                  }
                }
              ]);

              const estimatedHours = tasks.length > 0 ? tasks[0].estimatedHours : 0;
              const actualHours = tasks.length > 0 ? tasks[0].actualHours : 0;
              const variance = estimatedHours > 0 ? ((actualHours - estimatedHours) / estimatedHours) * 100 : 0;

              return {
                projectId,
                projectName: project.name,
                estimatedHours,
                actualHours,
                variance
              };
            })
          );

          const projectDetails = await Promise.all(
            projects.map(async (project: any) => {
              const projectId = project._id.toString();
              
              const tasks = await Task.aggregate([
                {
                  $match: {
                    projectId,
                    isActive: true
                  }
                },
                {
                  $group: {
                    _id: null,
                    total: { $sum: 1 },
                    completed: {
                      $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
                    },
                    estimatedHours: { $sum: { $ifNull: ['$estimatedHours', 0] } },
                    actualHours: { $sum: { $ifNull: ['$actualHours', 0] } }
                  }
                }
              ]);

              const taskData = tasks.length > 0 ? tasks[0] : { total: 0, completed: 0, estimatedHours: 0, actualHours: 0 };

              return {
                projectId,
                projectName: project.name,
                status: project.status || 'planned',
                progress: project.progress || 0,
                tasksTotal: taskData.total,
                tasksCompleted: taskData.completed,
                estimatedHours: taskData.estimatedHours,
                actualHours: taskData.actualHours
              };
            })
          );

          logger.info('Project progress analytics generated', { projectCount: projects.length });

          return {
            completionData,
            timeComparison: timeComparisons,
            projects: projectDetails
          };
        } catch (error) {
          logger.error('Error generating project progress analytics', { error });
          throw new AppError('Failed to generate project progress analytics', 500);
        }
      },

      pipelineAnalytics: async (_: any, { projectId }: { projectId?: string }) => {
        try {
          const filter: any = { isDeleted: false };
          if (projectId) filter.projectId = projectId;

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
