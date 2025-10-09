import { createModule, gql } from 'graphql-modules';
import { Task } from '../../../models/Task';
import { AppError } from '../../../middleware';
import { logger } from '../../../utils/logger';

export const taskModule = createModule({
  id: 'task',
  typeDefs: gql`
    type Task {
      id: ID!
      title: String!
      description: String
      status: TaskStatus!
      priority: TaskPriority!
      projectId: String
      issueId: String
      assignedTo: String
      dueDate: DateTime
      estimatedHours: Float
      actualHours: Float
      createdAt: DateTime!
      updatedAt: DateTime!
      completedAt: DateTime
      isActive: Boolean!
    }

    enum TaskStatus {
      pending
      in_progress
      completed
      blocked
      cancelled
    }

    enum TaskPriority {
      low
      medium
      high
      urgent
    }

    input CreateTaskInput {
      title: String!
      description: String
      status: TaskStatus
      priority: TaskPriority
      projectId: String
      issueId: String
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
        issueId: String
        status: TaskStatus
        priority: TaskPriority
        assignedTo: String
        limit: Int = 20
        offset: Int = 0
      ): [Task!]!
      tasksByProject(projectId: String!, status: TaskStatus, limit: Int = 20): [Task!]!
      tasksByIssue(issueId: String!): [Task!]!
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
        { projectId, issueId, status, priority, assignedTo, limit = 20, offset = 0 }: any
      ) => {
        const filter: any = { isActive: true };
        if (projectId) filter.projectId = projectId;
        if (issueId) filter.issueId = issueId;
        if (status) filter.status = status;
        if (priority) filter.priority = priority;
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
        if (status) filter.status = status;

        return await Task.find(filter)
          .limit(limit)
          .sort({ priority: -1, dueDate: 1 })
          .lean();
      },

      tasksByIssue: async (_: any, { issueId }: { issueId: string }) => {
        return await Task.find({ issueId, isActive: true }).sort({ priority: -1, dueDate: 1 }).lean();
      },
    },

    Mutation: {
      createTask: async (_: any, { input }: any) => {
        const task = new Task(input);
        await task.save();
        logger.info(`Created task: ${task.title}`);
        return task;
      },

      updateTask: async (_: any, { id, input }: any) => {
        const task = await Task.findByIdAndUpdate(id, input, {
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
