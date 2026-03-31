import { createModule, gql } from 'graphql-modules';
import { SprintRepo } from '../../../models/SprintRepo';
import { Sprint } from '../../../models/Sprint';
import { User } from '../../../models/User';
import { AppError } from '../../../middleware';
import { GraphQLContext, requireCurrentUser } from '../../../utils/auth';
import { canManageDepartmentSprints } from '../../../utils/accessControl';
import { logger } from '../../../utils/logger';
import { requireSprintRepoAccess, withSprintRepoFilter } from '../../../utils/rbac';
import mongoose from 'mongoose';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function requireSprintRepoManagement(
  context: GraphQLContext,
  sprintRepoId?: string | null
) {
  const currentUser = requireCurrentUser(context);
  if (!canManageDepartmentSprints(currentUser.accessRole, currentUser.isSuperAdmin)) {
    throw new AppError('Forbidden', 403);
  }

  if (sprintRepoId) {
    await requireSprintRepoAccess(context, sprintRepoId);
  }

  return currentUser;
}

export const sprintRepoModule = createModule({
  id: 'sprintRepo',
  typeDefs: gql`
    type SprintRepo {
      id: ID!
      name: String!
      key: String!
      description: String
      ownerId: String!
      ownerName: String!
      ownerUserId: ID
      owner: User
      groupId: String
      groupName: String
      status: SprintRepoStatus!
      zohoProjectId: String
      source: String
      zohoMetadata: JSON
      startDate: DateTime
      endDate: DateTime
      duration: Int
      sprintCount: Int!
      isActive: Boolean!
      createdAt: DateTime!
      updatedAt: DateTime!
    }

    enum SprintRepoStatus {
      ACTIVE
      ARCHIVED
      COMPLETED
    }

    input CreateSprintRepoInput {
      name: String!
      key: String!
      description: String
      ownerId: String!
      ownerName: String!
      groupId: String
      groupName: String
      startDate: DateTime
      endDate: DateTime
    }

    input UpdateSprintRepoInput {
      name: String
      description: String
      ownerName: String
      groupId: String
      groupName: String
      status: SprintRepoStatus
      startDate: DateTime
      endDate: DateTime
    }

    type SprintReposResult {
      sprintRepos: [SprintRepo!]!
      totalCount: Int!
    }

    extend type Query {
      sprintRepo(id: ID!, userId: ID, userRole: String): SprintRepo
      sprintRepoByKey(key: String!, userId: ID, userRole: String): SprintRepo
      sprintRepos(
        limit: Int = 20
        offset: Int = 0
        status: SprintRepoStatus
        groupName: String
        search: String
        userId: ID
        userRole: String
      ): SprintReposResult!
      sprintReposByGroup(groupId: String!, status: SprintRepoStatus, limit: Int = 20, userId: ID, userRole: String): [SprintRepo!]!
      sprintReposByOwner(ownerId: String!, status: SprintRepoStatus, limit: Int = 20, userId: ID, userRole: String): [SprintRepo!]!
      sprintReposByStatus(status: SprintRepoStatus!, limit: Int = 20, userId: ID, userRole: String): [SprintRepo!]!
    }

    extend type Mutation {
      createSprintRepo(input: CreateSprintRepoInput!): SprintRepo!
      updateSprintRepo(id: ID!, input: UpdateSprintRepoInput!): SprintRepo!
      deleteSprintRepo(id: ID!): Boolean!
      archiveSprintRepo(id: ID!): SprintRepo!
      activateSprintRepo(id: ID!): SprintRepo!
    }
  `,
  resolvers: {
    SprintRepo: {
      id: (parent: any) => parent._id?.toString() || parent.id,
      owner: async (parent: any) => {
        try {
          if (!parent.ownerUserId) return null;
          const user = await User.findById(parent.ownerUserId).lean();
          return user;
        } catch (error) {
          logger.error('Error fetching owner user for sprint repo', { sprintRepoId: parent._id || parent.id, error });
          return null;
        }
      },
      ownerUserId: (parent: any) => parent.ownerUserId?.toString() || null,
      status: (parent: any) => {
        return parent.status?.toUpperCase();
      },
      duration: (parent: any) => {
        if (!parent.startDate || !parent.endDate) return null;
        const start = new Date(parent.startDate).getTime();
        const end = new Date(parent.endDate).getTime();
        return Math.ceil((end - start) / (1000 * 60 * 60 * 24));
      },
      sprintCount: async (parent: any) => {
        try {
          const count = await Sprint.countDocuments({ 
            sprintRepoId: parent._id?.toString() || parent.id, 
            isActive: true 
          });
          return count;
        } catch (error) {
          logger.error('Error counting sprints for sprint repo', { sprintRepoId: parent._id || parent.id, error });
          return 0;
        }
      }
    },

    Query: {
      sprintRepo: async (
        _: any,
        { id, userId, userRole }: { id: string; userId?: string; userRole?: string },
        context: GraphQLContext
      ) => {
        try {
          requireCurrentUser(context);

          const sprintRepo = await SprintRepo.findById(id).lean();
          if (!sprintRepo) {
            throw new AppError('Sprint repository not found', 404);
          }
          await requireSprintRepoAccess(context, sprintRepo._id?.toString() || id);
          return sprintRepo;
        } catch (error) {
          logger.error('Error fetching sprint repository', { id, userId, error });
          throw error;
        }
      },

      sprintRepoByKey: async (
        _: any,
        { key, userId, userRole }: { key: string; userId?: string; userRole?: string },
        context: GraphQLContext
      ) => {
        try {
          requireCurrentUser(context);
          const sprintRepo = await SprintRepo.findByKey(key);
          if (!sprintRepo) {
            throw new AppError('Sprint repository not found', 404);
          }

          await requireSprintRepoAccess(context, sprintRepo._id?.toString());

          return sprintRepo;
        } catch (error) {
          logger.error('Error fetching sprint repository by key', { key, userId, error });
          throw error;
        }
      },

      sprintRepos: async (
        _: any,
        {
          limit,
          offset,
          status,
          groupName,
          search,
          userId,
          userRole,
        }: {
          limit: number;
          offset: number;
          status?: string;
          groupName?: string;
          search?: string;
          userId?: string;
          userRole?: string;
        },
        context: GraphQLContext
      ) => {
        try {
          requireCurrentUser(context);
          const andConditions: Record<string, unknown>[] = [{ isActive: true }];

          if (status) {
            andConditions.push({ status: status.toLowerCase() });
          }

          if (groupName) {
            andConditions.push({ groupName });
          }

          if (search?.trim()) {
            const searchRegex = new RegExp(escapeRegex(search.trim()), 'i');
            andConditions.push({
              $or: [
                { name: searchRegex },
                { key: searchRegex },
                { ownerName: searchRegex },
                { groupName: searchRegex },
                { description: searchRegex },
              ],
            });
          }

          const filter = andConditions.length === 1 ? andConditions[0] : { $and: andConditions };
          const scopedFilter = await withSprintRepoFilter(context, filter, '_id');

          const [sprintRepos, totalCount] = await Promise.all([
            SprintRepo.find(scopedFilter)
              .sort({ createdAt: -1 })
              .limit(limit)
              .skip(offset)
              .lean(),
            SprintRepo.countDocuments(scopedFilter),
          ]);

          return {
            sprintRepos,
            totalCount,
          };
        } catch (error) {
          logger.error('Error fetching sprint repositories', { limit, offset, status, groupName, search, userId, error });
          throw new AppError('Failed to fetch sprint repositories', 500);
        }
      },

      sprintReposByGroup: async (
        _: any,
        { groupId, status, limit, userId, userRole }: { groupId: string; status?: string; limit: number; userId?: string; userRole?: string },
        context: GraphQLContext
      ) => {
        try {
          requireCurrentUser(context);
          const filter: any = { groupId, isActive: true };
          if (status) {
            filter.status = status.toLowerCase();
          }

          const scopedFilter = await withSprintRepoFilter(context, filter, '_id');

          return await SprintRepo.find(scopedFilter)
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean();
        } catch (error) {
          logger.error('Error fetching sprint repositories by group', { groupId, status, userId, error });
          throw new AppError('Failed to fetch sprint repositories for group', 500);
        }
      },

      sprintReposByOwner: async (
        _: any,
        { ownerId, status, limit, userId, userRole }: { ownerId: string; status?: string; limit: number; userId?: string; userRole?: string },
        context: GraphQLContext
      ) => {
        try {
          requireCurrentUser(context);
          const filter: any = { ownerId, isActive: true };
          if (status) {
            filter.status = status.toLowerCase();
          }

          const scopedFilter = await withSprintRepoFilter(context, filter, '_id');

          return await SprintRepo.find(scopedFilter)
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean();
        } catch (error) {
          logger.error('Error fetching sprint repositories by owner', { ownerId, status, userId, error });
          throw new AppError('Failed to fetch sprint repositories for owner', 500);
        }
      },

      sprintReposByStatus: async (
        _: any,
        { status, limit, userId, userRole }: { status: string; limit: number; userId?: string; userRole?: string },
        context: GraphQLContext
      ) => {
        try {
          requireCurrentUser(context);
          const filter: any = { status: status.toLowerCase(), isActive: true };

          const scopedFilter = await withSprintRepoFilter(context, filter, '_id');

          return await SprintRepo.find(scopedFilter)
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean();
        } catch (error) {
          logger.error('Error fetching sprint repositories by status', { status, userId, error });
          throw new AppError('Failed to fetch sprint repositories by status', 500);
        }
      }
    },

    Mutation: {
      createSprintRepo: async (_: any, { input }: { input: any }, context: GraphQLContext) => {
        try {
          await requireSprintRepoManagement(context);

          // Validate dates if both are provided
          if (input.startDate && input.endDate) {
            if (new Date(input.endDate) <= new Date(input.startDate)) {
              throw new AppError('End date must be after start date', 400);
            }
          }

          // Check if key already exists
          const existing = await SprintRepo.findOne({ key: input.key });
          if (existing) {
            throw new AppError(`Sprint repository with key "${input.key}" already exists`, 400);
          }

          const sprintRepo = new SprintRepo({
            ...input,
            status: 'active'
          });

          await sprintRepo.save();
          logger.info('Sprint repository created', { sprintRepoId: sprintRepo._id, key: input.key });
          return sprintRepo.toObject();
        } catch (error) {
          logger.error('Error creating sprint repository', { input, error });
          throw error;
        }
      },

      updateSprintRepo: async (
        _: any,
        { id, input }: { id: string; input: any },
        context: GraphQLContext
      ) => {
        try {
          await requireSprintRepoManagement(context, id);

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

          const sprintRepo = await SprintRepo.findByIdAndUpdate(
            id,
            { $set: input },
            { new: true, runValidators: true }
          );

          if (!sprintRepo) {
            throw new AppError('Sprint repository not found', 404);
          }

          logger.info('Sprint repository updated', { sprintRepoId: id, updates: Object.keys(input) });
          return sprintRepo.toObject();
        } catch (error) {
          logger.error('Error updating sprint repository', { id, input, error });
          throw error;
        }
      },

      deleteSprintRepo: async (_: any, { id }: { id: string }, context: GraphQLContext) => {
        try {
          await requireSprintRepoManagement(context, id);

          // Soft delete
          const sprintRepo = await SprintRepo.findByIdAndUpdate(
            id,
            { $set: { isActive: false } },
            { new: true }
          );

          if (!sprintRepo) {
            throw new AppError('Sprint repository not found', 404);
          }

          logger.info('Sprint repository deleted', { sprintRepoId: id });
          return true;
        } catch (error) {
          logger.error('Error deleting sprint repository', { id, error });
          throw error;
        }
      },

      archiveSprintRepo: async (_: any, { id }: { id: string }, context: GraphQLContext) => {
        try {
          await requireSprintRepoManagement(context, id);
          const sprintRepo = await SprintRepo.findById(id);
          if (!sprintRepo) {
            throw new AppError('Sprint repository not found', 404);
          }

          await sprintRepo.archive();
          logger.info('Sprint repository archived', { sprintRepoId: id });
          return sprintRepo.toObject();
        } catch (error) {
          logger.error('Error archiving sprint repository', { id, error });
          throw error;
        }
      },

      activateSprintRepo: async (_: any, { id }: { id: string }, context: GraphQLContext) => {
        try {
          await requireSprintRepoManagement(context, id);
          const sprintRepo = await SprintRepo.findById(id);
          if (!sprintRepo) {
            throw new AppError('Sprint repository not found', 404);
          }

          await sprintRepo.activate();
          logger.info('Sprint repository activated', { sprintRepoId: id });
          return sprintRepo.toObject();
        } catch (error) {
          logger.error('Error activating sprint repository', { id, error });
          throw error;
        }
      }
    }
  }
});

