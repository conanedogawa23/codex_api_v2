import { createModule, gql } from 'graphql-modules';
import { Sprint } from '../../../models/Sprint';
import { SprintRepo } from '../../../models/SprintRepo';
import { Task } from '../../../models/Task';
import { User } from '../../../models/User';
import { AppError } from '../../../middleware';
import { logger } from '../../../utils/logger';
import mongoose from 'mongoose';

export const sprintModule = createModule({
  id: 'sprint',
  typeDefs: gql`
    type Sprint {
      id: ID!
      name: String!
      description: String
      sprintRepoId: String
      sprintRepo: SprintRepo
      assignees: [SprintAssignee!]!
      progress: SprintProgress!
      startDate: DateTime
      endDate: DateTime
      goal: String
      status: SprintStatus!
      statusName: String!
      statusType: String!
      statusUserName: String
      statusUserId: ID
      statusUser: User
      zohoSprintId: String
      zohoProjectId: String
      projectName: String
      source: String
      velocity: Float
      capacity: Float
      duration: Int
      isOverdue: Boolean!
      taskCount: Int!
      createdAt: DateTime!
      updatedAt: DateTime!
      isActive: Boolean!
    }

    type SprintAssignee {
      id: String!
      name: String!
      email: String!
    }

    type SprintProgress {
      totalTasks: Int!
      completedTasks: Int!
      percentage: Int!
    }

    enum SprintStatus {
      PLANNED
      ACTIVE
      COMPLETED
      CANCELLED
    }

    input SprintAssigneeInput {
      id: String!
      name: String!
      email: String!
    }

    input CreateSprintInput {
      name: String!
      description: String
      sprintRepoId: String!
      assignees: [SprintAssigneeInput!]
      startDate: DateTime!
      endDate: DateTime!
      goal: String
      capacity: Float
    }

    input UpdateSprintInput {
      name: String
      description: String
      sprintRepoId: String
      assignees: [SprintAssigneeInput!]
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
      sprintsBySprintRepo(sprintRepoId: ID!, status: SprintStatus, limit: Int = 20): [Sprint!]!
      sprintsByAssignee(userId: ID!, status: SprintStatus, limit: Int = 20): [Sprint!]!
      activeSprints(sprintRepoId: ID): [Sprint!]!
    }

    extend type Mutation {
      createSprint(input: CreateSprintInput!): Sprint!
      updateSprint(id: ID!, input: UpdateSprintInput!): Sprint!
      deleteSprint(id: ID!): Boolean!
      startSprint(id: ID!): Sprint!
      completeSprint(id: ID!, velocity: Float): Sprint!
      assignUserToSprint(sprintId: ID!, userId: String!, userName: String!, email: String!): Sprint!
      unassignUserFromSprint(sprintId: ID!, userId: String!): Sprint!
      updateSprintProgress(sprintId: ID!, totalTasks: Int!, completedTasks: Int!): Sprint!
    }
  `,
  resolvers: {
    Sprint: {
      id: (parent: any) => parent._id?.toString() || parent.id,
      sprintRepo: async (parent: any) => {
        try {
          const sprintRepo = await SprintRepo.findById(parent.sprintRepoId).lean();
          return sprintRepo;
        } catch (error) {
          logger.error('Error fetching sprint repo for sprint', { sprintId: parent._id || parent.id, error });
          return null;
        }
      },
      statusUser: async (parent: any) => {
        try {
          if (!parent.statusUserId) return null;
          const user = await User.findById(parent.statusUserId).lean();
          return user;
        } catch (error) {
          logger.error('Error fetching status user for sprint', { sprintId: parent._id || parent.id, error });
          return null;
        }
      },
      statusUserId: (parent: any) => parent.statusUserId?.toString() || null,
      assignees: (parent: any) => parent.assignees || [],
      progress: (parent: any) => {
        return parent.progress || { totalTasks: 0, completedTasks: 0, percentage: 0 };
      },
      status: (parent: any) => {
        // Handle Zoho-imported sprints that use statusType
        if (parent.statusType !== undefined) {
          const statusTypeMap: Record<number, string> = {
            1: 'PLANNED',    // Upcoming
            2: 'ACTIVE',     // Active
            3: 'COMPLETED',  // Completed
            4: 'CANCELLED'   // Cancelled (if exists)
          };
          return statusTypeMap[parent.statusType] || 'PLANNED';
        }
        
        // Handle manually created sprints with enum status
        const status = parent.status?.toLowerCase();
        const validStatuses = ['planned', 'active', 'completed', 'cancelled'];
        if (status && validStatuses.includes(status)) {
          return status.toUpperCase();
        }
        
        // Default fallback
        return 'PLANNED';
      },
      statusName: (parent: any) => {
        // Use existing statusName from Zoho imports if available
        if (parent.statusName) {
          return parent.statusName;
        }
        
        // Generate from status for manually created sprints
        const status = parent.status?.toLowerCase();
        const statusMap: Record<string, string> = {
          'planned': 'Planned',
          'active': 'Active',
          'completed': 'Completed',
          'cancelled': 'Cancelled'
        };
        return statusMap[status] || 'Planned';
      },
      statusType: (parent: any) => {
        // Use existing statusType from Zoho imports if available
        if (parent.statusType !== undefined) {
          return parent.statusType.toString();
        }
        
        // Generate from status for manually created sprints
        const status = parent.status?.toLowerCase();
        const typeMap: Record<string, string> = {
          'planned': '1',
          'active': '2',
          'completed': '3',
          'cancelled': '4'
        };
        return typeMap[status] || '1';
      },
      statusUserName: (parent: any) => {
        // Return existing statusUserName from database (for Zoho imports)
        return parent.statusUserName || null;
      },
      projectName: (parent: any) => {
        // Return existing projectName from database (for Zoho imports)
        if (parent.projectName) {
          return parent.projectName;
        }
        // For manually created sprints, this will be resolved via sprintRepo if needed
        return null;
      },
      duration: (parent: any) => {
        if (!parent.startDate || !parent.endDate) return null;
        const start = new Date(parent.startDate).getTime();
        const end = new Date(parent.endDate).getTime();
        return Math.ceil((end - start) / (1000 * 60 * 60 * 24));
      },
      isOverdue: (parent: any) => {
        if (!parent.endDate) return false;
        const status = parent.status?.toLowerCase();
        return status !== 'completed' && status !== 'cancelled' && new Date(parent.endDate) < new Date();
      },
      taskCount: async (parent: any) => {
        try {
          const sprintId = parent._id || parent.id;
          const sprintIdStr = sprintId?.toString();
          
          // Query for tasks with sprintId as either ObjectId or string
          const count = await Task.countDocuments({
            $or: [
              { sprintId: sprintId },
              { sprintId: sprintIdStr },
              { sprintId: mongoose.Types.ObjectId.isValid(sprintIdStr) ? new mongoose.Types.ObjectId(sprintIdStr) : null }
            ],
            isActive: true
          });
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

      sprintsBySprintRepo: async (
        _: any,
        { sprintRepoId, status, limit }: { sprintRepoId: string; status?: string; limit: number }
      ) => {
        try {
          const filter: any = { sprintRepoId, isActive: true };
          if (status) {
            filter.status = status.toLowerCase();
          }

          return await Sprint.find(filter)
            .sort({ startDate: -1 })
            .limit(limit)
            .lean();
        } catch (error) {
          logger.error('Error fetching sprints by sprint repo', { sprintRepoId, status, error });
          throw new AppError('Failed to fetch sprints for sprint repo', 500);
        }
      },

      sprintsByAssignee: async (
        _: any,
        { userId, status, limit }: { userId: string; status?: string; limit: number }
      ) => {
        try {
          const filter: any = { 'assignees.id': userId, isActive: true };
          if (status) {
            filter.status = status.toLowerCase();
          }

          return await Sprint.find(filter)
            .sort({ startDate: -1 })
            .limit(limit)
            .lean();
        } catch (error) {
          logger.error('Error fetching sprints by assignee', { userId, status, error });
          throw new AppError('Failed to fetch sprints for assignee', 500);
        }
      },

      activeSprints: async (_: any, { sprintRepoId }: { sprintRepoId?: string }) => {
        try {
          const filter: any = { status: 'active', isActive: true };
          if (sprintRepoId) {
            filter.sprintRepoId = sprintRepoId;
          }

          return await Sprint.find(filter)
            .sort({ startDate: -1 })
            .lean();
        } catch (error) {
          logger.error('Error fetching active sprints', { sprintRepoId, error });
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

          // Verify sprint repo exists
          const sprintRepo = await SprintRepo.findById(input.sprintRepoId);
          if (!sprintRepo) {
            throw new AppError('Sprint repository not found', 404);
          }

          // Check for overlapping sprints in the same sprint repo
          const overlapping = await Sprint.findOne({
            sprintRepoId: input.sprintRepoId,
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
            assignees: input.assignees || [],
            progress: {
              totalTasks: 0,
              completedTasks: 0,
              percentage: 0
            },
            status: 'planned'
          });

          await sprint.save();
          logger.info('Sprint created', { sprintId: sprint._id, sprintRepoId: input.sprintRepoId });
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
      },

      assignUserToSprint: async (
        _: any,
        { sprintId, userId, userName, email }: { sprintId: string; userId: string; userName: string; email: string }
      ) => {
        try {
          const sprint = await Sprint.findById(sprintId);
          if (!sprint) {
            throw new AppError('Sprint not found', 404);
          }

          await sprint.assignUser(userId, userName, email);
          logger.info('User assigned to sprint', { sprintId, userId });
          return sprint.toObject();
        } catch (error) {
          logger.error('Error assigning user to sprint', { sprintId, userId, error });
          throw error;
        }
      },

      unassignUserFromSprint: async (
        _: any,
        { sprintId, userId }: { sprintId: string; userId: string }
      ) => {
        try {
          const sprint = await Sprint.findById(sprintId);
          if (!sprint) {
            throw new AppError('Sprint not found', 404);
          }

          await sprint.unassignUser(userId);
          logger.info('User unassigned from sprint', { sprintId, userId });
          return sprint.toObject();
        } catch (error) {
          logger.error('Error unassigning user from sprint', { sprintId, userId, error });
          throw error;
        }
      },

      updateSprintProgress: async (
        _: any,
        { sprintId, totalTasks, completedTasks }: { sprintId: string; totalTasks: number; completedTasks: number }
      ) => {
        try {
          const sprint = await Sprint.findById(sprintId);
          if (!sprint) {
            throw new AppError('Sprint not found', 404);
          }

          await sprint.updateProgress(totalTasks, completedTasks);
          logger.info('Sprint progress updated', { sprintId, totalTasks, completedTasks });
          return sprint.toObject();
        } catch (error) {
          logger.error('Error updating sprint progress', { sprintId, error });
          throw error;
        }
      }
    }
  }
});

