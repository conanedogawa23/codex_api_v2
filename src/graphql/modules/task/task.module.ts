import { createModule, gql } from 'graphql-modules';
import mongoose from 'mongoose';
import { Task } from '../../../models/Task';
import { User } from '../../../models/User';
import { AppError } from '../../../middleware';
import { logger } from '../../../utils/logger';
import { getAccessibleProjectIds } from '../../../utils/rbac';

/**
 * Build an array of projectId values (both String and ObjectId) for $in queries.
 * Handles mixed ObjectId/String storage in the tasks collection.
 */
const buildProjectIdInValues = (projectIds: string[]): any[] => {
  const values: any[] = [];
  for (const pid of projectIds) {
    values.push(pid);
    if (mongoose.Types.ObjectId.isValid(pid)) {
      values.push(new mongoose.Types.ObjectId(pid));
    }
  }
  return values;
};

export const taskModule = createModule({
  id: 'task',
  typeDefs: gql`
    type TaskAssignee {
      id: String!
      name: String!
      email: String!
    }

    type TaskAttachment {
      name: String!
      url: String
      data: String
      type: String!
      size: Int
    }

    type Task {
      id: ID!
      gitlabIssueId: Int
      title: String!
      description: String
      status: TaskStatus!
      priority: TaskPriority!
      projectId: String!
      sprintId: String
      sprintRepoId: String
      storyPoints: Float
      sprintOrder: Int
      assignedTo: TaskAssignee
      assignedBy: TaskAssignee
      dueDate: DateTime
      estimatedHours: Float
      actualHours: Float
      completionPercentage: Int!
      tags: [String!]!
      comments: Int!
      dependencies: [String!]!
      subtasks: [String!]!
      attachments: [TaskAttachment!]!
      isOverdue: Boolean!
      daysUntilDue: Int
      lastSynced: DateTime!
      createdAt: DateTime!
      updatedAt: DateTime!
      completedAt: DateTime
      isActive: Boolean!
      zohoItemId: String
      zohoItemNumber: String
      zohoProjectId: String
      zohoSprintId: String
      zohoItemTypeId: String
      zohoItemTypeName: String
      zohoItemTypeColor: String
      zohoPriorityId: String
      zohoPriorityName: String
      zohoPriorityColor: String
      zohoStatusId: String
      zohoStatusName: String
      zohoStatusType: Int
      zohoStatusColor: String
      zohoEpicId: String
      source: String
      duration: String
      points: Float
    }
    
    """
    TaskDetails is an alias for Task for backward compatibility
    """
    type TaskDetails {
      id: ID!
      gitlabIssueId: Int
      title: String!
      description: String
      status: TaskStatus!
      priority: TaskPriority!
      projectId: String!
      sprintId: String
      sprintRepoId: String
      storyPoints: Float
      sprintOrder: Int
      assignedTo: TaskAssignee
      assignedBy: TaskAssignee
      dueDate: DateTime
      estimatedHours: Float
      actualHours: Float
      completionPercentage: Int!
      tags: [String!]!
      comments: Int!
      dependencies: [String!]!
      subtasks: [String!]!
      attachments: [TaskAttachment!]!
      isOverdue: Boolean!
      daysUntilDue: Int
      lastSynced: DateTime!
      createdAt: DateTime!
      updatedAt: DateTime!
      completedAt: DateTime
      isActive: Boolean!
      zohoItemId: String
      zohoItemNumber: String
      zohoProjectId: String
      zohoSprintId: String
      zohoItemTypeId: String
      zohoItemTypeName: String
      zohoItemTypeColor: String
      zohoPriorityId: String
      zohoPriorityName: String
      zohoPriorityColor: String
      zohoStatusId: String
      zohoStatusName: String
      zohoStatusType: Int
      zohoStatusColor: String
      zohoEpicId: String
      source: String
      duration: String
      points: Float
    }

    enum TaskStatus {
      PENDING
      IN_PROGRESS
      COMPLETED
      DELAYED
      CANCELLED
    }

    enum TaskPriority {
      LOW
      MEDIUM
      HIGH
      URGENT
    }

    type TaskSummary {
      total: Int!
      completed: Int!
      inProgress: Int!
      pending: Int!
    }

    type TaskFilterResult {
      tasks: [Task!]!
      totalCount: Int!
      statusSummary: TaskSummary!
    }

    input TaskFilterInput {
      projectId: String
      status: [TaskStatus]
      priority: TaskPriority
      assignedTo: String
      sprintId: String
      dueDateFrom: DateTime
      dueDateTo: DateTime
    }

    input CreateTaskInput {
      title: String!
      description: String
      status: TaskStatus
      priority: TaskPriority
      projectId: String!
      sprintId: String
      sprintRepoId: String
      storyPoints: Float
      assignedTo: String
      dueDate: DateTime
      estimatedHours: Float
    }

    input UpdateTaskInput {
      title: String
      description: String
      status: TaskStatus
      priority: TaskPriority
      projectId: String
      sprintId: String
      sprintRepoId: String
      storyPoints: Float
      sprintOrder: Int
      assignedTo: String
      dueDate: DateTime
      estimatedHours: Float
      actualHours: Float
    }

    input TaskAttachmentInput {
      name: String!
      url: String
      data: String
      type: String!
      size: Int
    }

    extend type Query {
      task(id: ID!): Task
      taskDetails(taskId: ID!): TaskDetails
      tasks(
        projectId: String
        status: TaskStatus
        priority: TaskPriority
        assignedTo: String
        limit: Int = 20
        offset: Int = 0
      ): [Task!]!
      tasksByFilter(filter: TaskFilterInput!, limit: Int = 20, offset: Int = 0, userId: ID, userRole: String): TaskFilterResult!
      tasksByProject(projectId: ID!, status: TaskStatus, limit: Int = 20, userId: ID, userRole: String): [TaskDetails!]!
      tasksBySprint(sprintId: ID!, limit: Int = 100, userId: ID, userRole: String): [Task!]!
      backlogTasks(projectId: ID!, limit: Int = 100, userId: ID, userRole: String): [Task!]!
      backlogTasksBySprintRepo(projectId: ID!, sprintRepoId: ID!, limit: Int = 100, userId: ID, userRole: String): [Task!]!
    }

    extend type Mutation {
      createTask(input: CreateTaskInput!): Task!
      updateTask(id: ID!, input: UpdateTaskInput!): Task!
      deleteTask(id: ID!): Boolean!
      completeTask(id: ID!, actualHours: Float): Task!
      addTaskToSprint(taskId: ID!, sprintId: ID!, sprintOrder: Int): Task!
      removeTaskFromSprint(taskId: ID!): Task!
      updateTaskSprintOrder(taskId: ID!, sprintOrder: Int!): Task!
      updateTaskStoryPoints(taskId: ID!, storyPoints: Float!): Task!
      addTaskAttachment(taskId: ID!, attachment: TaskAttachmentInput!): Task!
      removeTaskAttachment(taskId: ID!, attachmentName: String!): Task!
    }
  `,
  resolvers: {
    Task: {
      id: (parent: any) => parent._id?.toString() || parent.id,
      status: (parent: any) => {
        // Map database hyphenated lowercase values to GraphQL uppercase underscore values
        // DB: 'in-progress' -> GraphQL: 'IN_PROGRESS'
        return parent.status?.replace(/-/g, '_').toUpperCase();
      },
      priority: (parent: any) => {
        // Map database lowercase values to GraphQL uppercase values
        // DB: 'high' -> GraphQL: 'HIGH'
        return parent.priority?.toUpperCase();
      },
      sprintId: (parent: any) => parent.sprintId?.toString ? parent.sprintId.toString() : parent.sprintId,
      sprintRepoId: (parent: any) => parent.sprintRepoId?.toString ? parent.sprintRepoId.toString() : parent.sprintRepoId,
      assignedTo: (parent: any) => {
        // Return null if assignedTo is missing or doesn't have required fields
        if (!parent.assignedTo || !parent.assignedTo.id) return null;
        return parent.assignedTo;
      },
      assignedBy: (parent: any) => {
        // Return null if assignedBy is missing or doesn't have required fields
        if (!parent.assignedBy || !parent.assignedBy.id) return null;
        return parent.assignedBy;
      },
      completionPercentage: (parent: any) => parent.completionPercentage || 0,
      tags: (parent: any) => parent.tags || [],
      comments: (parent: any) => parent.comments || 0,
      dependencies: (parent: any) => parent.dependencies || [],
      subtasks: (parent: any) => parent.subtasks || [],
      attachments: (parent: any) => parent.attachments || [],
      isOverdue: (parent: any) => {
        // Calculate if task is overdue
        if (!parent.dueDate) return false;
        const status = parent.status?.toLowerCase().replace(/_/g, '-');
        return parent.dueDate < new Date() && status !== 'completed';
      },
      daysUntilDue: (parent: any) => {
        // Calculate days until due date
        if (!parent.dueDate) return null;
        const now = new Date();
        const diffTime = new Date(parent.dueDate).getTime() - now.getTime();
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      },
      points: (parent: any) => {
        // Return storyPoints value for both GitLab and Zoho tasks
        return parent.storyPoints || null;
      },
    },
    
    // TaskDetails resolver (alias for Task)
    TaskDetails: {
      id: (parent: any) => parent._id?.toString() || parent.id,
      status: (parent: any) => {
        return parent.status?.replace(/-/g, '_').toUpperCase();
      },
      priority: (parent: any) => {
        return parent.priority?.toUpperCase();
      },
      sprintId: (parent: any) => parent.sprintId?.toString ? parent.sprintId.toString() : parent.sprintId,
      sprintRepoId: (parent: any) => parent.sprintRepoId?.toString ? parent.sprintRepoId.toString() : parent.sprintRepoId,
      assignedTo: (parent: any) => {
        // Return null if assignedTo is missing or doesn't have required fields
        if (!parent.assignedTo || !parent.assignedTo.id) return null;
        return parent.assignedTo;
      },
      assignedBy: (parent: any) => {
        // Return null if assignedBy is missing or doesn't have required fields
        if (!parent.assignedBy || !parent.assignedBy.id) return null;
        return parent.assignedBy;
      },
      completionPercentage: (parent: any) => parent.completionPercentage || 0,
      tags: (parent: any) => parent.tags || [],
      comments: (parent: any) => parent.comments || 0,
      dependencies: (parent: any) => parent.dependencies || [],
      subtasks: (parent: any) => parent.subtasks || [],
      attachments: (parent: any) => parent.attachments || [],
      isOverdue: (parent: any) => {
        if (!parent.dueDate) return false;
        const status = parent.status?.toLowerCase().replace(/_/g, '-');
        return parent.dueDate < new Date() && status !== 'completed';
      },
      daysUntilDue: (parent: any) => {
        if (!parent.dueDate) return null;
        const now = new Date();
        const diffTime = new Date(parent.dueDate).getTime() - now.getTime();
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      },
      points: (parent: any) => {
        // Return storyPoints value for both GitLab and Zoho tasks
        return parent.storyPoints || null;
      },
    },
    
    Query: {
      task: async (_: any, { id }: { id: string }) => {
        const task = await Task.findById(id).lean();
        if (!task) {
          throw new AppError('Task not found', 404);
        }
        return task;
      },

      taskDetails: async (_: any, { taskId }: { taskId: string }) => {
        const task = await Task.findById(taskId).lean();
        if (!task) {
          throw new AppError('Task not found', 404);
        }
        logger.info(`Fetched task details for task ${taskId}`);
        return task;
      },

      tasks: async (
        _: any,
        { projectId, status, priority, assignedTo, limit = 20, offset = 0 }: any
      ) => {
        // Use raw collection to handle mixed ObjectId/String types in projectId and assignedTo.id
        const db = mongoose.connection.db;
        const tasksCollection = db.collection('tasks');
        const filter: any = { isActive: true };

        // projectId is stored as both ObjectId and String in DB
        if (projectId) {
          filter.$and = filter.$and || [];
          filter.$and.push({
            $or: [
              { projectId: projectId },
              ...(mongoose.Types.ObjectId.isValid(projectId)
                ? [{ projectId: new mongoose.Types.ObjectId(projectId) }]
                : [])
            ]
          });
        }
        // Convert GraphQL enum (uppercase underscore) to DB format (lowercase hyphen)
        if (status) filter.status = status.toLowerCase().replace(/_/g, '-');
        if (priority) filter.priority = priority.toLowerCase();
        // assignedTo.id is stored as both ObjectId and String in DB
        if (assignedTo) {
          filter.$and = filter.$and || [];
          filter.$and.push({
            $or: [
              { 'assignedTo.id': assignedTo },
              ...(mongoose.Types.ObjectId.isValid(assignedTo)
                ? [{ 'assignedTo.id': new mongoose.Types.ObjectId(assignedTo) }]
                : [])
            ]
          });
        }

        const results = await tasksCollection
          .find(filter)
          .sort({ priority: -1, dueDate: 1, _id: 1 })
          .skip(offset)
          .limit(limit)
          .toArray();
        return results;
      },

      tasksByProject: async (
        _: any,
        { projectId, status, limit = 20, userId, userRole }: { projectId: string; status?: string; limit: number; userId?: string; userRole?: string }
      ) => {
        // Apply RBAC: verify user can access this project
        if (userId && userRole) {
          const rbacResult = await getAccessibleProjectIds(userId, userRole);
          if (!rbacResult.isAdminUser) {
            if (!rbacResult.projectIds.includes(projectId)) {
              logger.info('Non-admin user denied access to project tasks', { userId, userRole, projectId });
              return [];
            }
          }
        }

        // Use raw collection to handle mixed ObjectId/String projectId
        const db = mongoose.connection.db;
        const tasksCollection = db.collection('tasks');
        const filter: any = {
          isActive: true,
          $or: [
            { projectId: projectId },
            ...(mongoose.Types.ObjectId.isValid(projectId)
              ? [{ projectId: new mongoose.Types.ObjectId(projectId) }]
              : [])
          ]
        };
        // Convert GraphQL enum to DB format
        if (status) filter.status = status.toLowerCase().replace(/_/g, '-');

        const results = await tasksCollection
          .find(filter)
          .sort({ priority: -1, dueDate: 1, _id: 1 })
          .limit(limit)
          .toArray();
        return results;
      },

      tasksByFilter: async (
        _: any,
        { filter, limit = 20, offset = 0, userId, userRole }: { filter: any; limit: number; offset: number; userId?: string; userRole?: string }
      ) => {
        // Use raw collection to handle mixed ObjectId/String types
        const db = mongoose.connection.db;
        const tasksCollection = db.collection('tasks');
        const query: any = { isActive: true };

        // Apply RBAC: restrict to accessible projects for non-admin users
        const emptyResult = { tasks: [], totalCount: 0, statusSummary: { total: 0, completed: 0, inProgress: 0, pending: 0 } };
        let rbacProjectFilter: any = null;
        if (userId && userRole) {
          const rbacResult = await getAccessibleProjectIds(userId, userRole);
          if (!rbacResult.isAdminUser) {
            if (rbacResult.projectIds.length === 0) {
              logger.info('Non-admin user has no accessible projects for tasks', { userId, userRole });
              return emptyResult;
            }
            const accessibleValues = buildProjectIdInValues(rbacResult.projectIds);
            rbacProjectFilter = { projectId: { $in: accessibleValues } };
            query.$and = query.$and || [];
            query.$and.push(rbacProjectFilter);
            logger.info('Applying RBAC filter to tasksByFilter', { userId, userRole, accessibleProjects: rbacResult.projectIds.length });
          }
        }

        // Handle mixed ObjectId/String projectId
        if (filter.projectId) {
          query.$and = query.$and || [];
          query.$and.push({
            $or: [
              { projectId: filter.projectId },
              ...(mongoose.Types.ObjectId.isValid(filter.projectId)
                ? [{ projectId: new mongoose.Types.ObjectId(filter.projectId) }]
                : [])
            ]
          });
        }
        if (filter.status) {
          if (Array.isArray(filter.status)) {
            query.status = { $in: filter.status.map((s: string) => s.toLowerCase().replace(/_/g, '-')) };
          } else {
            query.status = filter.status.toLowerCase().replace(/_/g, '-');
          }
        }
        if (filter.priority) query.priority = filter.priority.toLowerCase();
        // Handle mixed ObjectId/String assignedTo.id
        if (filter.assignedTo) {
          query.$and = query.$and || [];
          query.$and.push({
            $or: [
              { 'assignedTo.id': filter.assignedTo },
              ...(mongoose.Types.ObjectId.isValid(filter.assignedTo)
                ? [{ 'assignedTo.id': new mongoose.Types.ObjectId(filter.assignedTo) }]
                : [])
            ]
          });
        }
        if (filter.sprintId !== undefined) {
          if (filter.sprintId === null || filter.sprintId === '') {
            query.sprintId = { $exists: false };
          } else {
            query.sprintId = filter.sprintId;
          }
        }
        
        // Date range filters
        if (filter.dueDateFrom || filter.dueDateTo) {
          query.dueDate = {};
          if (filter.dueDateFrom) query.dueDate.$gte = new Date(filter.dueDateFrom);
          if (filter.dueDateTo) query.dueDate.$lte = new Date(filter.dueDateTo);
        }

        // Get tasks with pagination (sort before skip/limit, _id for deterministic ordering)
        const tasks = await tasksCollection
          .find(query)
          .sort({ priority: -1, dueDate: 1, _id: 1 })
          .skip(offset)
          .limit(limit)
          .toArray();

        // Get total count for current filter
        const totalCount = await tasksCollection.countDocuments(query);

        // Calculate status summary efficiently using aggregation
        // Build base query for status summary (exclude status filter to get all counts)
        const baseQuery: any = { isActive: true };

        // Apply RBAC filter to baseQuery as well
        if (rbacProjectFilter) {
          baseQuery.$and = baseQuery.$and || [];
          baseQuery.$and.push(rbacProjectFilter);
        }

        // Apply non-status filters for status summary (project, assignee, etc.)
        if (filter.projectId) {
          baseQuery.$and = baseQuery.$and || [];
          baseQuery.$and.push({
            $or: [
              { projectId: filter.projectId },
              ...(mongoose.Types.ObjectId.isValid(filter.projectId)
                ? [{ projectId: new mongoose.Types.ObjectId(filter.projectId) }]
                : [])
            ]
          });
        }
        if (filter.assignedTo) {
          baseQuery.$and = baseQuery.$and || [];
          baseQuery.$and.push({
            $or: [
              { 'assignedTo.id': filter.assignedTo },
              ...(mongoose.Types.ObjectId.isValid(filter.assignedTo)
                ? [{ 'assignedTo.id': new mongoose.Types.ObjectId(filter.assignedTo) }]
                : [])
            ]
          });
        }
        if (filter.sprintId !== undefined) {
          if (filter.sprintId === null || filter.sprintId === '') {
            baseQuery.sprintId = { $exists: false };
          } else {
            baseQuery.sprintId = filter.sprintId;
          }
        }
        if (filter.dueDateFrom || filter.dueDateTo) {
          baseQuery.dueDate = {};
          if (filter.dueDateFrom) baseQuery.dueDate.$gte = new Date(filter.dueDateFrom);
          if (filter.dueDateTo) baseQuery.dueDate.$lte = new Date(filter.dueDateTo);
        }
        
        // Use MongoDB aggregation for efficient counting by status
        const statusCounts = await Task.aggregate([
          { $match: baseQuery },
          {
            $group: {
              _id: '$status',
              count: { $sum: 1 }
            }
          }
        ]);

        // Build status summary from aggregation results
        const statusMap = statusCounts.reduce((acc: any, curr: any) => {
          acc[curr._id] = curr.count;
          return acc;
        }, {});

        const statusSummary = {
          total: Object.values(statusMap).reduce((sum: number, count: any) => sum + count, 0) as number,
          completed: statusMap['completed'] || 0,
          inProgress: statusMap['in-progress'] || 0,
          pending: statusMap['pending'] || 0,
        };

        return {
          tasks,
          totalCount,
          statusSummary,
        };
      },

      tasksBySprint: async (_: any, { sprintId, limit = 100, userId, userRole }: { sprintId: string; limit: number; userId?: string; userRole?: string }) => {
        try {
          // Apply RBAC: restrict to accessible projects for non-admin users
          let rbacFilter: any = {};
          if (userId && userRole) {
            const rbacResult = await getAccessibleProjectIds(userId, userRole);
            if (!rbacResult.isAdminUser) {
              if (rbacResult.projectIds.length === 0) {
                logger.info('Non-admin user has no accessible projects for sprint tasks', { userId, userRole });
                return [];
              }
              const accessibleValues = buildProjectIdInValues(rbacResult.projectIds);
              rbacFilter = { projectId: { $in: accessibleValues } };
            }
          }

          // Handle both ObjectId and string types for sprintId
          const sprintObjectId = mongoose.Types.ObjectId.isValid(sprintId) 
            ? new mongoose.Types.ObjectId(sprintId) 
            : null;
          
          return await Task.find({
            $or: [
              { sprintId: sprintId },
              { sprintId: sprintObjectId }
            ],
            isActive: true,
            ...rbacFilter,
          })
            .sort({ sprintOrder: 1, createdAt: 1 })
            .limit(limit)
            .lean();
        } catch (error) {
          logger.error('Error fetching tasks by sprint', { sprintId, error });
          throw new AppError('Failed to fetch sprint tasks', 500);
        }
      },

      backlogTasks: async (_: any, { projectId, limit = 100, userId, userRole }: { projectId: string; limit: number; userId?: string; userRole?: string }) => {
        try {
          // Apply RBAC: verify user can access this project
          if (userId && userRole) {
            const rbacResult = await getAccessibleProjectIds(userId, userRole);
            if (!rbacResult.isAdminUser) {
              if (!rbacResult.projectIds.includes(projectId)) {
                logger.info('Non-admin user denied access to backlog tasks', { userId, userRole, projectId });
                return [];
              }
            }
          }

          return await Task.find({
            projectId,
            isActive: true,
            $or: [
              { sprintId: { $exists: false } },
              { sprintId: null }
            ]
          })
            .sort({ priority: -1, createdAt: 1 })
            .limit(limit)
            .lean();
        } catch (error) {
          logger.error('Error fetching backlog tasks', { projectId, error });
          throw new AppError('Failed to fetch backlog tasks', 500);
        }
      },

      backlogTasksBySprintRepo: async (
        _: any,
        { projectId, sprintRepoId, limit = 100, userId, userRole }: { projectId: string; sprintRepoId: string; limit: number; userId?: string; userRole?: string }
      ) => {
        try {
          if (!mongoose.Types.ObjectId.isValid(projectId)) {
            throw new AppError('Invalid project ID', 400);
          }
          if (!mongoose.Types.ObjectId.isValid(sprintRepoId)) {
            throw new AppError('Invalid sprintRepo ID', 400);
          }

          // Apply RBAC: verify user can access this project
          if (userId && userRole) {
            const rbacResult = await getAccessibleProjectIds(userId, userRole);
            if (!rbacResult.isAdminUser) {
              if (!rbacResult.projectIds.includes(projectId)) {
                logger.info('Non-admin user denied access to sprint repo backlog tasks', { userId, userRole, projectId });
                return [];
              }
            }
          }

          return await Task.find({
            projectId,
            sprintRepoId,
            isActive: true,
            $or: [
              { sprintId: { $exists: false } },
              { sprintId: null }
            ]
          })
            .sort({ priority: -1, createdAt: 1 })
            .limit(limit)
            .lean();
        } catch (error) {
          logger.error('Error fetching backlog tasks by sprint repo', { projectId, sprintRepoId, error });
          throw new AppError('Failed to fetch backlog tasks by sprint repo', 500);
        }
      },
    },

    Mutation: {
      createTask: async (_: any, { input }: any) => {
        // Validate projectId is provided
        if (!input.projectId) {
          throw new AppError('projectId is required for creating a task', 400);
        }

        // Convert GraphQL enum values to DB format
        const dbInput = { ...input };
        if (dbInput.status) dbInput.status = dbInput.status.toLowerCase().replace(/_/g, '-');
        if (dbInput.priority) dbInput.priority = dbInput.priority.toLowerCase();
        
        // If assignedTo is provided, fetch user details and populate the object
        if (dbInput.assignedTo) {
          const user = await User.findById(dbInput.assignedTo).lean();
          if (user) {
            dbInput.assignedTo = {
              id: user._id.toString(),
              name: user.name,
              email: user.email,
            };
          } else {
            logger.warn(`User not found for assignedTo: ${dbInput.assignedTo}`);
            dbInput.assignedTo = undefined;
          }
        }
        
        const task = new Task(dbInput);
        await task.save();
        logger.info(`Created task: ${task.title}`, { projectId: task.projectId });
        return task;
      },

      updateTask: async (_: any, { id, input }: any) => {
        // Convert GraphQL enum values to DB format
        const dbInput = { ...input };
        if (dbInput.status) dbInput.status = dbInput.status.toLowerCase().replace(/_/g, '-');
        if (dbInput.priority) dbInput.priority = dbInput.priority.toLowerCase();
        
        // Auto-update completionPercentage and completedAt based on status
        if (dbInput.status === 'completed') {
          dbInput.completionPercentage = 100;
          if (!dbInput.completedAt) {
            dbInput.completedAt = new Date();
          }
        } else if (dbInput.status && dbInput.status !== 'completed') {
          // If status is changed away from completed, clear completedAt
          dbInput.completedAt = null;
        }
        
        // If assignedTo is provided, fetch user details and populate the object
        if (dbInput.assignedTo) {
          const user = await User.findById(dbInput.assignedTo).lean();
          if (user) {
            dbInput.assignedTo = {
              id: user._id.toString(),
              name: user.name,
              email: user.email,
            };
          } else {
            logger.warn(`User not found for assignedTo: ${dbInput.assignedTo}`);
            dbInput.assignedTo = undefined;
          }
        }
        
        const task = await Task.findByIdAndUpdate(id, dbInput, {
          new: true,
          runValidators: true,
        });
        if (!task) {
          throw new AppError('Task not found', 404);
        }
        logger.info(`Updated task: ${task.title}`);
        return task;
      },

      deleteTask: async (_: any, { id }: { id: string }) => {
        const task = await Task.findByIdAndUpdate(
          id,
          { isActive: false },
          { new: true }
        );
        if (!task) {
          throw new AppError('Task not found', 404);
        }
        logger.info(`Deleted task: ${task.title}`);
        return true;
      },

      completeTask: async (_: any, { id, actualHours }: { id: string; actualHours?: number }) => {
        const updateData: any = {
          status: 'completed',
          completedAt: new Date(),
          completionPercentage: 100, // Set to 100% when completing
        };
        if (actualHours !== undefined) {
          updateData.actualHours = actualHours;
        }

        const task = await Task.findByIdAndUpdate(id, updateData, {
          new: true,
          runValidators: true,
        });
        if (!task) {
          throw new AppError('Task not found', 404);
        }
        logger.info(`Completed task: ${task.title}`);
        return task;
      },

      addTaskToSprint: async (
        _: any,
        { taskId, sprintId, sprintOrder }: { taskId: string; sprintId: string; sprintOrder?: number }
      ) => {
        try {
          const updateData: any = { sprintId };
          if (sprintOrder !== undefined) {
            updateData.sprintOrder = sprintOrder;
          }

          const task = await Task.findByIdAndUpdate(
            taskId,
            { $set: updateData },
            { new: true, runValidators: true }
          );

          if (!task) {
            throw new AppError('Task not found', 404);
          }

          logger.info('Task added to sprint', { taskId, sprintId });
          return task;
        } catch (error) {
          logger.error('Error adding task to sprint', { taskId, sprintId, error });
          throw error;
        }
      },

      removeTaskFromSprint: async (_: any, { taskId }: { taskId: string }) => {
        try {
          const task = await Task.findByIdAndUpdate(
            taskId,
            { $unset: { sprintId: '', sprintOrder: '' } },
            { new: true, runValidators: true }
          );

          if (!task) {
            throw new AppError('Task not found', 404);
          }

          logger.info('Task removed from sprint', { taskId });
          return task;
        } catch (error) {
          logger.error('Error removing task from sprint', { taskId, error });
          throw error;
        }
      },

      updateTaskSprintOrder: async (
        _: any,
        { taskId, sprintOrder }: { taskId: string; sprintOrder: number }
      ) => {
        try {
          const task = await Task.findByIdAndUpdate(
            taskId,
            { $set: { sprintOrder } },
            { new: true, runValidators: true }
          );

          if (!task) {
            throw new AppError('Task not found', 404);
          }

          logger.info('Task sprint order updated', { taskId, sprintOrder });
          return task;
        } catch (error) {
          logger.error('Error updating task sprint order', { taskId, error });
          throw error;
        }
      },

      updateTaskStoryPoints: async (
        _: any,
        { taskId, storyPoints }: { taskId: string; storyPoints: number }
      ) => {
        try {
          const task = await Task.findByIdAndUpdate(
            taskId,
            { $set: { storyPoints } },
            { new: true, runValidators: true }
          );

          if (!task) {
            throw new AppError('Task not found', 404);
          }

          logger.info('Task story points updated', { taskId, storyPoints });
          return task;
        } catch (error) {
          logger.error('Error updating task story points', { taskId, error });
          throw error;
        }
      },

      addTaskAttachment: async (
        _: any,
        { taskId, attachment }: { taskId: string; attachment: any }
      ) => {
        try {
          const task = await Task.findById(taskId);
          if (!task) {
            throw new AppError('Task not found', 404);
          }

          // Validate file size (5MB limit for base64)
          const maxSize = 5 * 1024 * 1024; // 5MB in bytes
          if (attachment.size && attachment.size > maxSize) {
            throw new AppError('File size exceeds 5MB limit', 400);
          }

          // Check total attachments size (20MB limit per task)
          const totalSize = task.attachments.reduce((sum: number, att: any) => sum + (att.size || 0), 0);
          if (totalSize + (attachment.size || 0) > 20 * 1024 * 1024) {
            throw new AppError('Total attachments size exceeds 20MB limit', 400);
          }

          await task.addAttachment(attachment);

          logger.info('Attachment added to task', { taskId, attachmentName: attachment.name });
          return task;
        } catch (error) {
          logger.error('Error adding task attachment', { taskId, error });
          throw error;
        }
      },

      removeTaskAttachment: async (
        _: any,
        { taskId, attachmentName }: { taskId: string; attachmentName: string }
      ) => {
        try {
          const task = await Task.findById(taskId);
          if (!task) {
            throw new AppError('Task not found', 404);
          }

          await task.removeAttachment(attachmentName);

          logger.info('Attachment removed from task', { taskId, attachmentName });
          return task;
        } catch (error) {
          logger.error('Error removing task attachment', { taskId, error });
          throw error;
        }
      },
    },
  },
});
