import { createModule, gql } from 'graphql-modules';
import { SprintRepo } from '../../../models/SprintRepo';
import { Sprint } from '../../../models/Sprint';
import { AppError } from '../../../middleware';
import { logger } from '../../../utils/logger';
import mongoose from 'mongoose';

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
      groupId: String
      groupName: String
      status: SprintRepoStatus!
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

    extend type Query {
      sprintRepo(id: ID!): SprintRepo
      sprintRepoByKey(key: String!): SprintRepo
      sprintRepos(limit: Int = 20, offset: Int = 0): [SprintRepo!]!
      sprintReposByGroup(groupId: String!, status: SprintRepoStatus, limit: Int = 20): [SprintRepo!]!
      sprintReposByOwner(ownerId: String!, status: SprintRepoStatus, limit: Int = 20): [SprintRepo!]!
      sprintReposByStatus(status: SprintRepoStatus!, limit: Int = 20): [SprintRepo!]!
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
          const sprintRepoId = parent._id || parent.id;
          const sprintRepoIdStr = sprintRepoId?.toString();
          
          // Query for sprints with sprintRepoId as either ObjectId or string
          const count = await Sprint.countDocuments({
            $or: [
              { sprintRepoId: sprintRepoId },
              { sprintRepoId: sprintRepoIdStr },
              { sprintRepoId: mongoose.Types.ObjectId.isValid(sprintRepoIdStr) ? new mongoose.Types.ObjectId(sprintRepoIdStr) : null }
            ],
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
      sprintRepo: async (_: any, { id }: { id: string }) => {
        try {
          const sprintRepo = await SprintRepo.findById(id).lean();
          if (!sprintRepo) {
            throw new AppError('Sprint repository not found', 404);
          }
          return sprintRepo;
        } catch (error) {
          logger.error('Error fetching sprint repository', { id, error });
          throw error;
        }
      },

      sprintRepoByKey: async (_: any, { key }: { key: string }) => {
        try {
          const sprintRepo = await SprintRepo.findByKey(key);
          if (!sprintRepo) {
            throw new AppError('Sprint repository not found', 404);
          }
          return sprintRepo;
        } catch (error) {
          logger.error('Error fetching sprint repository by key', { key, error });
          throw error;
        }
      },

      sprintRepos: async (_: any, { limit, offset }: { limit: number; offset: number }) => {
        try {
          return await SprintRepo.find({ isActive: true })
            .sort({ createdAt: -1 })
            .limit(limit)
            .skip(offset)
            .lean();
        } catch (error) {
          logger.error('Error fetching sprint repositories', { limit, offset, error });
          throw new AppError('Failed to fetch sprint repositories', 500);
        }
      },

      sprintReposByGroup: async (
        _: any,
        { groupId, status, limit }: { groupId: string; status?: string; limit: number }
      ) => {
        try {
          const filter: any = { groupId, isActive: true };
          if (status) {
            filter.status = status.toLowerCase();
          }

          return await SprintRepo.find(filter)
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean();
        } catch (error) {
          logger.error('Error fetching sprint repositories by group', { groupId, status, error });
          throw new AppError('Failed to fetch sprint repositories for group', 500);
        }
      },

      sprintReposByOwner: async (
        _: any,
        { ownerId, status, limit }: { ownerId: string; status?: string; limit: number }
      ) => {
        try {
          const filter: any = { ownerId, isActive: true };
          if (status) {
            filter.status = status.toLowerCase();
          }

          return await SprintRepo.find(filter)
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean();
        } catch (error) {
          logger.error('Error fetching sprint repositories by owner', { ownerId, status, error });
          throw new AppError('Failed to fetch sprint repositories for owner', 500);
        }
      },

      sprintReposByStatus: async (
        _: any,
        { status, limit }: { status: string; limit: number }
      ) => {
        try {
          return await SprintRepo.find({ status: status.toLowerCase(), isActive: true })
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean();
        } catch (error) {
          logger.error('Error fetching sprint repositories by status', { status, error });
          throw new AppError('Failed to fetch sprint repositories by status', 500);
        }
      }
    },

    Mutation: {
      createSprintRepo: async (_: any, { input }: { input: any }) => {
        try {
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

      updateSprintRepo: async (_: any, { id, input }: { id: string; input: any }) => {
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

      deleteSprintRepo: async (_: any, { id }: { id: string }) => {
        try {
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

      archiveSprintRepo: async (_: any, { id }: { id: string }) => {
        try {
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

      activateSprintRepo: async (_: any, { id }: { id: string }) => {
        try {
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

