import { createModule, gql } from 'graphql-modules';
import { Task } from '../../../models/Task';
import { User } from '../../../models/User';
import { AppError } from '../../../middleware';
import { logger } from '../../../utils/logger';

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
      url: String!
      type: String!
    }

    type Task {
      id: ID!
      gitlabIssueId: Int
      title: String!
      description: String
      status: TaskStatus!
      priority: TaskPriority!
      projectId: String!
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
      createdAt: DateTime!
      updatedAt: DateTime!
      completedAt: DateTime
      isActive: Boolean!
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
      createdAt: DateTime!
      updatedAt: DateTime!
      completedAt: DateTime
      isActive: Boolean!
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
      status: TaskStatus
      priority: TaskPriority
      assignedTo: String
      dueDateFrom: DateTime
      dueDateTo: DateTime
    }

    input CreateTaskInput {
      title: String!
      description: String
      status: TaskStatus
      priority: TaskPriority
      projectId: String!
      assignedTo: String
      dueDate: DateTime
      estimatedHours: Float
    }

    input UpdateTaskInput {
      title: String
      description: String
      status: TaskStatus
      priority: TaskPriority
      assignedTo: String
      dueDate: DateTime
      estimatedHours: Float
      actualHours: Float
    }

    extend type Query {
      task(id: ID!): Task
      tasks(
        projectId: String
        status: TaskStatus
        priority: TaskPriority
        assignedTo: String
        limit: Int = 20
        offset: Int = 0
      ): [Task!]!
      tasksByFilter(filter: TaskFilterInput!, limit: Int = 20, offset: Int = 0): TaskFilterResult!
      tasksByProject(projectId: ID!, status: TaskStatus, limit: Int = 20): [TaskDetails!]!
    }

    extend type Mutation {
      createTask(input: CreateTaskInput!): Task!
      updateTask(id: ID!, input: UpdateTaskInput!): Task!
      deleteTask(id: ID!): Boolean!
      completeTask(id: ID!, actualHours: Float): Task!
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
    },
    
    Query: {
      task: async (_: any, { id }: { id: string }) => {
        const task = await Task.findById(id).lean();
        if (!task) {
          throw new AppError('Task not found', 404);
        }
        return task;
      },

      tasks: async (
        _: any,
        { projectId, status, priority, assignedTo, limit = 20, offset = 0 }: any
      ) => {
        const filter: any = { isActive: true };
        if (projectId) filter.projectId = projectId;
        // Convert GraphQL enum (uppercase underscore) to DB format (lowercase hyphen)
        if (status) filter.status = status.toLowerCase().replace(/_/g, '-');
        if (priority) filter.priority = priority.toLowerCase();
        if (assignedTo) filter['assignedTo.id'] = assignedTo;

        return await Task.find(filter)
          .limit(limit)
          .skip(offset)
          .sort({ priority: -1, dueDate: 1 })
          .lean();
      },

      tasksByProject: async (
        _: any,
        { projectId, status, limit = 20 }: { projectId: string; status?: string; limit: number }
      ) => {
        const filter: any = { projectId, isActive: true };
        // Convert GraphQL enum to DB format
        if (status) filter.status = status.toLowerCase().replace(/_/g, '-');

        return await Task.find(filter)
          .limit(limit)
          .sort({ priority: -1, dueDate: 1 })
          .lean();
      },

      tasksByFilter: async (
        _: any,
        { filter, limit = 20, offset = 0 }: { filter: any; limit: number; offset: number }
      ) => {
        const query: any = { isActive: true };

        // Apply filters (convert GraphQL uppercase format to DB lowercase hyphen format)
        if (filter.projectId) query.projectId = filter.projectId;
        if (filter.status) query.status = filter.status.toLowerCase().replace(/_/g, '-');
        if (filter.priority) query.priority = filter.priority.toLowerCase();
        if (filter.assignedTo) query['assignedTo.id'] = filter.assignedTo;
        
        // Date range filters
        if (filter.dueDateFrom || filter.dueDateTo) {
          query.dueDate = {};
          if (filter.dueDateFrom) query.dueDate.$gte = new Date(filter.dueDateFrom);
          if (filter.dueDateTo) query.dueDate.$lte = new Date(filter.dueDateTo);
        }

        // Get tasks with pagination
        const tasks = await Task.find(query)
          .limit(limit)
          .skip(offset)
          .sort({ priority: -1, dueDate: 1 })
          .lean();

        // Get total count
        const totalCount = await Task.countDocuments(query);

        // Calculate status summary
        const allTasks = await Task.find(query).select('status').lean();
        const statusSummary = {
          total: allTasks.length,
          completed: allTasks.filter((t: any) => t.status === 'completed').length,
          inProgress: allTasks.filter((t: any) => t.status === 'in-progress').length,
          pending: allTasks.filter((t: any) => t.status === 'pending').length,
        };

        return {
          tasks,
          totalCount,
          statusSummary,
        };
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
    },
  },
});
