import { createModule, gql } from 'graphql-modules';
import { Sprint } from '../../../models/Sprint';
import { Task } from '../../../models/Task';
import { AppError } from '../../../middleware';
import { logger } from '../../../utils/logger';

export const sprintModule = createModule({
  id: 'sprint',
  typeDefs: gql`
    type Sprint {
      id: ID!
      name: String!
      description: String
      projectId: String!
      startDate: DateTime!
      endDate: DateTime!
      goal: String
      status: SprintStatus!
      velocity: Float
      capacity: Float
      duration: Int!
      isOverdue: Boolean!
      taskCount: Int!
      createdAt: DateTime!
      updatedAt: DateTime!
      isActive: Boolean!
    }

    enum SprintStatus {
      PLANNED
      ACTIVE
      COMPLETED
      CANCELLED
    }

    input CreateSprintInput {
      name: String!
      description: String
      projectId: String!
      startDate: DateTime!
      endDate: DateTime!
      goal: String
      capacity: Float
    }

    input UpdateSprintInput {
      name: String
      description: String
      startDate: DateTime
      endDate: DateTime
      goal: String
      capacity: Float
      velocity: Float
      status: SprintStatus
    }

    extend type Query {
      sprint(id: ID!): Sprint
      sprints(limit: Int = 20, offset: Int = 0): [Sprint!]!
      sprintsByProject(projectId: ID!, status: SprintStatus, limit: Int = 20): [Sprint!]!
      activeSprints(projectId: ID): [Sprint!]!
    }

    extend type Mutation {
      createSprint(input: CreateSprintInput!): Sprint!
      updateSprint(id: ID!, input: UpdateSprintInput!): Sprint!
      deleteSprint(id: ID!): Boolean!
      startSprint(id: ID!): Sprint!
      completeSprint(id: ID!, velocity: Float): Sprint!
    }
  `,
  resolvers: {
    Sprint: {
      id: (parent: any) => parent._id?.toString() || parent.id,
      status: (parent: any) => {
        return parent.status?.toUpperCase();
      },
      duration: (parent: any) => {
        const start = new Date(parent.startDate).getTime();
        const end = new Date(parent.endDate).getTime();
        return Math.ceil((end - start) / (1000 * 60 * 60 * 24));
      },
      isOverdue: (parent: any) => {
        const status = parent.status?.toLowerCase();
        return status !== 'completed' && status !== 'cancelled' && new Date(parent.endDate) < new Date();
      },
      taskCount: async (parent: any) => {
        try {
          const count = await Task.countDocuments({ sprintId: parent._id || parent.id, isActive: true });
          return count;
        } catch (error) {
          logger.error('Error counting tasks for sprint', { sprintId: parent._id || parent.id, error });
          return 0;
        }
      }
    },

    Query: {
      sprint: async (_: any, { id }: { id: string }) => {
        try {
          const sprint = await Sprint.findById(id).lean();
          if (!sprint) {
            throw new AppError('Sprint not found', 404);
          }
          return sprint;
        } catch (error) {
          logger.error('Error fetching sprint', { id, error });
          throw error;
        }
      },

      sprints: async (_: any, { limit, offset }: { limit: number; offset: number }) => {
        try {
          return await Sprint.find({ isActive: true })
            .sort({ startDate: -1 })
            .limit(limit)
            .skip(offset)
            .lean();
        } catch (error) {
          logger.error('Error fetching sprints', { limit, offset, error });
          throw new AppError('Failed to fetch sprints', 500);
        }
      },

      sprintsByProject: async (
        _: any,
        { projectId, status, limit }: { projectId: string; status?: string; limit: number }
      ) => {
        try {
          const filter: any = { projectId, isActive: true };
          if (status) {
            filter.status = status.toLowerCase();
          }

          return await Sprint.find(filter)
            .sort({ startDate: -1 })
            .limit(limit)
            .lean();
        } catch (error) {
          logger.error('Error fetching sprints by project', { projectId, status, error });
          throw new AppError('Failed to fetch sprints for project', 500);
        }
      },

      activeSprints: async (_: any, { projectId }: { projectId?: string }) => {
        try {
          const filter: any = { status: 'active', isActive: true };
          if (projectId) {
            filter.projectId = projectId;
          }

          return await Sprint.find(filter)
            .sort({ startDate: -1 })
            .lean();
        } catch (error) {
          logger.error('Error fetching active sprints', { projectId, error });
          throw new AppError('Failed to fetch active sprints', 500);
        }
      }
    },

    Mutation: {
      createSprint: async (_: any, { input }: { input: any }) => {
        try {
          // Validate dates
          if (new Date(input.endDate) <= new Date(input.startDate)) {
            throw new AppError('End date must be after start date', 400);
          }

          // Check for overlapping sprints in the same project
          const overlapping = await Sprint.findOne({
            projectId: input.projectId,
            isActive: true,
            status: { $in: ['planned', 'active'] },
            $or: [
              { startDate: { $lte: input.endDate }, endDate: { $gte: input.startDate } }
            ]
          });

          if (overlapping) {
            throw new AppError('Sprint dates overlap with an existing sprint', 400);
          }

          const sprint = new Sprint({
            ...input,
            status: 'planned'
          });

          await sprint.save();
          logger.info('Sprint created', { sprintId: sprint._id, projectId: input.projectId });
          return sprint.toObject();
        } catch (error) {
          logger.error('Error creating sprint', { input, error });
          throw error;
        }
      },

      updateSprint: async (_: any, { id, input }: { id: string; input: any }) => {
        try {
          // Validate dates if both are provided
          if (input.startDate && input.endDate) {
            if (new Date(input.endDate) <= new Date(input.startDate)) {
              throw new AppError('End date must be after start date', 400);
            }
          }

          // Map status from GraphQL enum to database value
          if (input.status) {
            input.status = input.status.toLowerCase();
          }

          const sprint = await Sprint.findByIdAndUpdate(
            id,
            { $set: input },
            { new: true, runValidators: true }
          );

          if (!sprint) {
            throw new AppError('Sprint not found', 404);
          }

          logger.info('Sprint updated', { sprintId: id, updates: Object.keys(input) });
          return sprint.toObject();
        } catch (error) {
          logger.error('Error updating sprint', { id, input, error });
          throw error;
        }
      },

      deleteSprint: async (_: any, { id }: { id: string }) => {
        try {
          // Soft delete
          const sprint = await Sprint.findByIdAndUpdate(
            id,
            { $set: { isActive: false } },
            { new: true }
          );

          if (!sprint) {
            throw new AppError('Sprint not found', 404);
          }

          // Move tasks back to backlog
          await Task.updateMany(
            { sprintId: id },
            { $unset: { sprintId: '', sprintOrder: '' } }
          );

          logger.info('Sprint deleted', { sprintId: id });
          return true;
        } catch (error) {
          logger.error('Error deleting sprint', { id, error });
          throw error;
        }
      },

      startSprint: async (_: any, { id }: { id: string }) => {
        try {
          const sprint = await Sprint.findById(id);
          if (!sprint) {
            throw new AppError('Sprint not found', 404);
          }

          if (sprint.status !== 'planned') {
            throw new AppError('Only planned sprints can be started', 400);
          }

          sprint.status = 'active';
          await sprint.save();

          logger.info('Sprint started', { sprintId: id });
          return sprint.toObject();
        } catch (error) {
          logger.error('Error starting sprint', { id, error });
          throw error;
        }
      },

      completeSprint: async (_: any, { id, velocity }: { id: string; velocity?: number }) => {
        try {
          const sprint = await Sprint.findById(id);
          if (!sprint) {
            throw new AppError('Sprint not found', 404);
          }

          if (sprint.status !== 'active') {
            throw new AppError('Only active sprints can be completed', 400);
          }

          // Calculate velocity if not provided
          let finalVelocity = velocity;
          if (!finalVelocity) {
            const completedTasks = await Task.find({
              sprintId: id,
              status: 'completed',
              isActive: true
            }).lean();
            
            finalVelocity = completedTasks.reduce((sum, task) => sum + (task.storyPoints || 0), 0);
          }

          sprint.status = 'completed';
          sprint.velocity = finalVelocity;
          await sprint.save();

          logger.info('Sprint completed', { sprintId: id, velocity: finalVelocity });
          return sprint.toObject();
        } catch (error) {
          logger.error('Error completing sprint', { id, error });
          throw error;
        }
      }
    }
  }
});

