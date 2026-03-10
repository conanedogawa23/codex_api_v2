import { createModule, gql } from 'graphql-modules';
import mongoose from 'mongoose';
import { Sprint } from '../../../models/Sprint';
import { SprintRepo } from '../../../models/SprintRepo';
import { Task } from '../../../models/Task';
import { User } from '../../../models/User';
import { AppError } from '../../../middleware';
import { logger } from '../../../utils/logger';
import { getAccessibleSprintRepoIds } from '../../../utils/rbac';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildSprintStatusConditions(status: string): Record<string, unknown>[] {
  switch (status) {
    case 'PLANNED':
      return [
        { status: 'planned' },
        { statusName: /^planned$/i },
        { statusName: /^upcoming$/i },
        { statusType: 1 },
      ];
    case 'ACTIVE':
      return [
        { status: 'active' },
        { statusName: /^active$/i },
        { statusType: 2 },
      ];
    case 'COMPLETED':
      return [
        { status: 'completed' },
        { statusName: /^completed$/i },
        { statusType: 3 },
      ];
    case 'CANCELLED':
      return [
        { status: 'cancelled' },
        { status: 'canceled' },
        { statusName: /^cancelled$/i },
        { statusName: /^canceled$/i },
        { statusType: 4 },
      ];
    default:
      return [{ status: status.toLowerCase() }];
  }
}

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
      status: String
      statusName: String
      statusType: Int
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

    type SprintsResult {
      sprints: [Sprint!]!
      totalCount: Int!
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
      status: String
    }

    extend type Query {
      sprint(id: ID!): Sprint
      sprints(
        limit: Int = 20
        offset: Int = 0
        status: SprintStatus
        sprintRepoId: ID
        search: String
        userId: ID
        userRole: String
      ): SprintsResult!
      sprintsBySprintRepo(sprintRepoId: ID!, status: SprintStatus, limit: Int = 20, userId: ID, userRole: String): [Sprint!]!
      sprintsByAssignee(userId: ID!, status: SprintStatus, limit: Int = 20): [Sprint!]!
      activeSprints(sprintRepoId: ID, userId: ID, userRole: String): [Sprint!]!
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
      sprintRepoId: (parent: any) => parent.sprintRepoId?.toString ? parent.sprintRepoId.toString() : parent.sprintRepoId,
      sprintRepo: async (parent: any) => {
        try {
          const sprintRepo = await SprintRepo.findById(parent.sprintRepoId).lean();
          return sprintRepo;
        } catch (error) {
          logger.error('Error fetching sprint repo for sprint', { sprintId: parent._id || parent.id, error });
          return null;
        }
      },
      projectName: async (parent: any) => {
        try {
          // Return stored projectName if available
          if (parent.projectName) return parent.projectName;
          
          // Otherwise fetch from SprintRepo
          if (parent.sprintRepoId) {
            const sprintRepo = await SprintRepo.findById(parent.sprintRepoId).select('name').lean();
            return sprintRepo?.name || null;
          }
          
          // For Zoho sprints without sprintRepoId, try to find by zohoProjectId
          if (parent.zohoProjectId) {
            const sprintRepo = await SprintRepo.findOne({ zohoProjectId: parent.zohoProjectId }).select('name').lean();
            return sprintRepo?.name || null;
          }
          
          return null;
        } catch (error) {
          logger.error('Error fetching project name for sprint', { sprintId: parent._id || parent.id, error });
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
        // Return status as-is (can be Zoho user ID or text status like "active")
        return parent.status || null;
      },
      statusName: (parent: any) => parent.statusName || null,
      statusType: (parent: any) => parent.statusType || null,
      statusUserName: (parent: any) => parent.statusUserName || null,
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
          const sprintIdString = parent._id?.toString() || parent.id;
          
          // Use raw MongoDB collection to bypass Mongoose schema casting
          const db = mongoose.connection.db;
          const tasksCollection = db.collection('tasks');
          
          const filter: any = {
            $or: [
              { sprintId: sprintIdString, isActive: true },  // String match
              { sprintId: new mongoose.Types.ObjectId(sprintIdString), isActive: true }  // ObjectId match
            ]
          };
          
          const count = await tasksCollection.countDocuments(filter);
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

      sprints: async (
        _: any,
        {
          limit,
          offset,
          status,
          sprintRepoId,
          search,
          userId,
          userRole,
        }: {
          limit: number;
          offset: number;
          status?: string;
          sprintRepoId?: string;
          search?: string;
          userId?: string;
          userRole?: string;
        }
      ) => {
        try {
          const andConditions: Record<string, unknown>[] = [{ isActive: true }];

          // Apply role-based filtering if userId and userRole are provided
          if (userId && userRole) {
            const accessibleSprintRepoIds = await getAccessibleSprintRepoIds(userId, userRole);
            
            // If user has no access, return empty array
            if (accessibleSprintRepoIds.length === 1 && accessibleSprintRepoIds[0] === 'no-access') {
              return {
                sprints: [],
                totalCount: 0,
              };
            }
            
            // If not admin and has accessible repos, filter by them
            if (accessibleSprintRepoIds.length > 0) {
              andConditions.push({
                sprintRepoId: {
                  $in: accessibleSprintRepoIds
                    .filter((id) => mongoose.Types.ObjectId.isValid(id))
                    .map((id) => new mongoose.Types.ObjectId(id)),
                },
              });
            }
            // If accessibleSprintRepoIds is empty array, user is admin - no filtering needed
          }

          if (sprintRepoId) {
            if (!mongoose.Types.ObjectId.isValid(sprintRepoId)) {
              throw new AppError('Invalid sprint repository id', 400);
            }

            andConditions.push({
              sprintRepoId: new mongoose.Types.ObjectId(sprintRepoId),
            });
          }

          if (status) {
            andConditions.push({
              $or: buildSprintStatusConditions(status),
            });
          }

          if (search?.trim()) {
            const searchRegex = new RegExp(escapeRegex(search.trim()), 'i');
            andConditions.push({
              $or: [
                { name: searchRegex },
                { description: searchRegex },
                { goal: searchRegex },
                { projectName: searchRegex },
              ],
            });
          }

          const filter = andConditions.length === 1 ? andConditions[0] : { $and: andConditions };

          const [sprints, totalCount] = await Promise.all([
            Sprint.find(filter)
              .sort({ startDate: -1 })
              .limit(limit)
              .skip(offset)
              .lean(),
            Sprint.countDocuments(filter),
          ]);

          return {
            sprints,
            totalCount,
          };
        } catch (error) {
          logger.error('Error fetching sprints', { limit, offset, status, sprintRepoId, search, userId, error });
          if (error instanceof AppError) {
            throw error;
          }
          throw new AppError('Failed to fetch sprints', 500);
        }
      },

      sprintsBySprintRepo: async (
        _: any,
        { sprintRepoId, status, limit, userId, userRole }: { sprintRepoId: string; status?: string; limit: number; userId?: string; userRole?: string }
      ) => {
        try {
          // Apply role-based access control
          if (userId && userRole) {
            const accessibleSprintRepoIds = await getAccessibleSprintRepoIds(userId, userRole);
            
            // Check if user has access to this specific sprint repo
            if (accessibleSprintRepoIds.length > 0 && !accessibleSprintRepoIds.includes(sprintRepoId)) {
              // User doesn't have access to this sprint repo
              return [];
            }
          }

          // Use raw MongoDB collection to bypass Mongoose schema casting
          // (sprintRepoId is defined as String in schema but stored as ObjectId in DB)
          const db = mongoose.connection.db;
          const sprintsCollection = db.collection('sprints');
          
          const filter: any = { 
            $or: [
              { sprintRepoId: sprintRepoId },  // String match
              { sprintRepoId: new mongoose.Types.ObjectId(sprintRepoId) }  // ObjectId match
            ],
            isActive: true 
          };
          
          if (status) {
            // Convert GraphQL enum (PLANNED, ACTIVE, etc.) to lowercase for database query
            filter.status = status.toLowerCase();
          }

          const results = await sprintsCollection
            .find(filter)
            .sort({ startDate: -1 })
            .limit(limit)
            .toArray();
          
          return results;
        } catch (error) {
          logger.error('Error fetching sprints by sprint repo', { sprintRepoId, status, userId, error });
          throw new AppError('Failed to fetch sprints for sprint repo', 500);
        }
      },

      sprintsByAssignee: async (
        _: any,
        { userId, status, limit }: { userId: string; status?: string; limit: number }
      ) => {
        try {
          // Note: assignees.id is stored as string in the database, no ObjectId conversion needed
          const filter: any = { 'assignees.id': userId, isActive: true };
          if (status) {
            // Convert GraphQL enum (PLANNED, ACTIVE, etc.) to lowercase for database query
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

      activeSprints: async (_: any, { sprintRepoId, userId, userRole }: { sprintRepoId?: string; userId?: string; userRole?: string }) => {
        try {
          const filter: any = { status: 'active', isActive: true };

          // Apply role-based filtering
          if (userId && userRole) {
            const accessibleSprintRepoIds = await getAccessibleSprintRepoIds(userId, userRole);
            
            // If user has no access, return empty array
            if (accessibleSprintRepoIds.length === 1 && accessibleSprintRepoIds[0] === 'no-access') {
              return [];
            }
            
            if (sprintRepoId) {
              // Check if user has access to the specific sprint repo
              if (accessibleSprintRepoIds.length > 0 && !accessibleSprintRepoIds.includes(sprintRepoId)) {
                return [];  // User doesn't have access
              }
              filter.sprintRepoId = sprintRepoId;
            } else {
              // Filter by accessible sprint repos if not admin
              if (accessibleSprintRepoIds.length > 0) {
                filter.sprintRepoId = { $in: accessibleSprintRepoIds };
              }
            }
          } else if (sprintRepoId) {
            filter.sprintRepoId = sprintRepoId;
          }

          return await Sprint.find(filter)
            .sort({ startDate: -1 })
            .lean();
        } catch (error) {
          logger.error('Error fetching active sprints', { sprintRepoId, userId, error });
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

