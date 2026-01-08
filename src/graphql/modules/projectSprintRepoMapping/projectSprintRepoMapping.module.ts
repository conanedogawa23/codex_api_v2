import { createModule, gql } from 'graphql-modules';
import { ProjectSprintRepoMapping } from '../../../models/ProjectSprintRepoMapping';
import { Project } from '../../../models/Project';
import { SprintRepo } from '../../../models/SprintRepo';
import { AppError } from '../../../middleware';
import { logger } from '../../../utils/logger';
import mongoose from 'mongoose';

export const projectSprintRepoMappingModule = createModule({
  id: 'projectSprintRepoMapping',
  typeDefs: gql`
    type ProjectSprintRepoMapping {
      id: ID!
      projectId: String!
      project: ProjectDetails
      sprintRepoId: String!
      sprintRepo: SprintRepo
      isActive: Boolean!
      createdAt: DateTime!
      updatedAt: DateTime!
    }

    input CreateProjectSprintRepoMappingInput {
      projectId: ID!
      sprintRepoId: ID!
    }

    input BulkCreateProjectSprintRepoMappingsInput {
      projectId: ID!
      sprintRepoIds: [ID!]!
    }

    input BulkDeleteProjectSprintRepoMappingsInput {
      ids: [ID!]!
    }

    type BulkCreateMappingsResult {
      success: Boolean!
      createdCount: Int!
      mappings: [ProjectSprintRepoMapping!]!
    }

    type BulkDeleteMappingsResult {
      success: Boolean!
      deletedCount: Int!
    }

    extend type Query {
      projectSprintRepoMapping(id: ID!): ProjectSprintRepoMapping
      projectSprintRepoMappings(
        projectId: ID
        sprintRepoId: ID
        isActive: Boolean
        limit: Int = 50
        offset: Int = 0
      ): [ProjectSprintRepoMapping!]!
      sprintReposByProject(projectId: ID!): [SprintRepo!]!
      projectsBySprintRepo(sprintRepoId: ID!): [ProjectDetails!]!
    }

    extend type Mutation {
      createProjectSprintRepoMapping(input: CreateProjectSprintRepoMappingInput!): ProjectSprintRepoMapping!
      deleteProjectSprintRepoMapping(id: ID!): Boolean!
      bulkCreateProjectSprintRepoMappings(input: BulkCreateProjectSprintRepoMappingsInput!): BulkCreateMappingsResult!
      bulkDeleteProjectSprintRepoMappings(input: BulkDeleteProjectSprintRepoMappingsInput!): BulkDeleteMappingsResult!
    }
  `,
  resolvers: {
    ProjectSprintRepoMapping: {
      id: (parent: any) => parent._id?.toString() || parent.id,
      projectId: (parent: any) => parent.projectId?.toString() || parent.projectId,
      sprintRepoId: (parent: any) => parent.sprintRepoId?.toString() || parent.sprintRepoId,
      project: async (parent: any) => {
        try {
          const projectId = parent.projectId?.toString() || parent.projectId;
          if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
            logger.warn('Invalid project ID in mapping', { projectId });
            return null;
          }
          const project = await Project.findById(projectId).lean();
          return project;
        } catch (error) {
          logger.error('Error fetching project for mapping', { 
            mappingId: parent._id || parent.id, 
            projectId: parent.projectId,
            error 
          });
          return null;
        }
      },
      sprintRepo: async (parent: any) => {
        try {
          const sprintRepoId = parent.sprintRepoId?.toString() || parent.sprintRepoId;
          if (!sprintRepoId || !mongoose.Types.ObjectId.isValid(sprintRepoId)) {
            logger.warn('Invalid sprintRepo ID in mapping', { sprintRepoId });
            return null;
          }
          const sprintRepo = await SprintRepo.findById(sprintRepoId).lean();
          return sprintRepo;
        } catch (error) {
          logger.error('Error fetching sprintRepo for mapping', { 
            mappingId: parent._id || parent.id, 
            sprintRepoId: parent.sprintRepoId,
            error 
          });
          return null;
        }
      }
    },

    Query: {
      projectSprintRepoMapping: async (_: any, { id }: { id: string }) => {
        try {
          if (!mongoose.Types.ObjectId.isValid(id)) {
            throw new AppError('Invalid mapping ID', 400);
          }
          
          const mapping = await ProjectSprintRepoMapping.findById(id).lean();
          if (!mapping) {
            throw new AppError('Mapping not found', 404);
          }
          return mapping;
        } catch (error) {
          logger.error('Error fetching mapping', { id, error });
          throw error;
        }
      },

      projectSprintRepoMappings: async (
        _: any,
        { projectId, sprintRepoId, isActive, limit, offset }: {
          projectId?: string;
          sprintRepoId?: string;
          isActive?: boolean;
          limit: number;
          offset: number;
        }
      ) => {
        try {
          const filter: any = {};
          
          if (projectId) {
            if (!mongoose.Types.ObjectId.isValid(projectId)) {
              throw new AppError('Invalid project ID', 400);
            }
            filter.projectId = projectId;
          }
          
          if (sprintRepoId) {
            if (!mongoose.Types.ObjectId.isValid(sprintRepoId)) {
              throw new AppError('Invalid sprintRepo ID', 400);
            }
            filter.sprintRepoId = sprintRepoId;
          }
          
          if (isActive !== undefined) {
            filter.isActive = isActive;
          } else {
            filter.isActive = true; // Default to active mappings
          }

          const mappings = await ProjectSprintRepoMapping.find(filter)
            .sort({ createdAt: -1 })
            .limit(limit)
            .skip(offset)
            .lean();

          return mappings;
        } catch (error) {
          logger.error('Error fetching mappings', { projectId, sprintRepoId, isActive, error });
          throw error;
        }
      },

      sprintReposByProject: async (_: any, { projectId }: { projectId: string }) => {
        try {
          if (!mongoose.Types.ObjectId.isValid(projectId)) {
            throw new AppError('Invalid project ID', 400);
          }

          // Fetch active mappings for the project
          const mappings = await ProjectSprintRepoMapping.find({
            projectId,
            isActive: true
          }).lean();

          if (!mappings || mappings.length === 0) {
            return [];
          }

          // Extract sprintRepo IDs
          const sprintRepoIds = mappings.map(m => m.sprintRepoId);

          // Fetch all sprintRepos in one query
          const sprintRepos = await SprintRepo.find({
            _id: { $in: sprintRepoIds },
            isActive: true
          })
          .sort({ name: 1 })
          .lean();

          return sprintRepos;
        } catch (error) {
          logger.error('Error fetching sprintRepos by project', { projectId, error });
          throw error;
        }
      },

      projectsBySprintRepo: async (_: any, { sprintRepoId }: { sprintRepoId: string }) => {
        try {
          if (!mongoose.Types.ObjectId.isValid(sprintRepoId)) {
            throw new AppError('Invalid sprintRepo ID', 400);
          }

          // Fetch active mappings for the sprintRepo
          const mappings = await ProjectSprintRepoMapping.find({
            sprintRepoId,
            isActive: true
          }).lean();

          if (!mappings || mappings.length === 0) {
            return [];
          }

          // Extract project IDs
          const projectIds = mappings.map(m => m.projectId);

          // Fetch all projects in one query
          const projects = await Project.find({
            _id: { $in: projectIds },
            isActive: true
          })
          .sort({ name: 1 })
          .lean();

          return projects;
        } catch (error) {
          logger.error('Error fetching projects by sprintRepo', { sprintRepoId, error });
          throw error;
        }
      }
    },

    Mutation: {
      createProjectSprintRepoMapping: async (
        _: any,
        { input }: { input: { projectId: string; sprintRepoId: string } }
      ) => {
        try {
          const { projectId, sprintRepoId } = input;

          // Validate IDs
          if (!mongoose.Types.ObjectId.isValid(projectId)) {
            throw new AppError('Invalid project ID', 400);
          }
          if (!mongoose.Types.ObjectId.isValid(sprintRepoId)) {
            throw new AppError('Invalid sprintRepo ID', 400);
          }

          // Verify project exists
          const project = await Project.findById(projectId).lean();
          if (!project) {
            throw new AppError('Project not found', 404);
          }

          // Verify sprintRepo exists
          const sprintRepo = await SprintRepo.findById(sprintRepoId).lean();
          if (!sprintRepo) {
            throw new AppError('SprintRepo not found', 404);
          }

          // Check if mapping already exists
          const existingMapping = await ProjectSprintRepoMapping.findOne({
            projectId,
            sprintRepoId
          });

          if (existingMapping) {
            if (existingMapping.isActive) {
              throw new AppError('Mapping already exists', 400);
            } else {
              // Reactivate if it was soft deleted
              await existingMapping.activate();
              logger.info('Reactivated existing mapping', { 
                mappingId: existingMapping._id, 
                projectId, 
                sprintRepoId 
              });
              return existingMapping.toObject();
            }
          }

          // Create new mapping
          const mapping = new ProjectSprintRepoMapping({
            projectId,
            sprintRepoId,
            isActive: true
          });

          await mapping.save();
          logger.info('Created mapping', { 
            mappingId: mapping._id, 
            projectId, 
            sprintRepoId 
          });

          return mapping.toObject();
        } catch (error) {
          logger.error('Error creating mapping', { input, error });
          throw error;
        }
      },

      deleteProjectSprintRepoMapping: async (_: any, { id }: { id: string }) => {
        try {
          if (!mongoose.Types.ObjectId.isValid(id)) {
            throw new AppError('Invalid mapping ID', 400);
          }

          const mapping = await ProjectSprintRepoMapping.findById(id);
          if (!mapping) {
            throw new AppError('Mapping not found', 404);
          }

          // Soft delete
          await mapping.deactivate();
          logger.info('Deleted mapping', { mappingId: id });

          return true;
        } catch (error) {
          logger.error('Error deleting mapping', { id, error });
          throw error;
        }
      },

      bulkCreateProjectSprintRepoMappings: async (
        _: any,
        { input }: { input: { projectId: string; sprintRepoIds: string[] } }
      ) => {
        try {
          const { projectId, sprintRepoIds } = input;

          // Validate project ID
          if (!mongoose.Types.ObjectId.isValid(projectId)) {
            throw new AppError('Invalid project ID', 400);
          }

          // Verify project exists
          const project = await Project.findById(projectId).lean();
          if (!project) {
            throw new AppError('Project not found', 404);
          }

          // Validate all sprintRepo IDs
          const invalidIds = sprintRepoIds.filter(id => !mongoose.Types.ObjectId.isValid(id));
          if (invalidIds.length > 0) {
            throw new AppError(`Invalid sprintRepo IDs: ${invalidIds.join(', ')}`, 400);
          }

          // Verify all sprintRepos exist
          const sprintRepos = await SprintRepo.find({
            _id: { $in: sprintRepoIds }
          }).lean();

          if (sprintRepos.length !== sprintRepoIds.length) {
            throw new AppError('One or more sprintRepos not found', 404);
          }

          const createdMappings: any[] = [];
          let createdCount = 0;

          // Create mappings for each sprintRepo
          for (const sprintRepoId of sprintRepoIds) {
            try {
              // Check if mapping already exists
              const existingMapping = await ProjectSprintRepoMapping.findOne({
                projectId,
                sprintRepoId
              });

              if (existingMapping) {
                if (!existingMapping.isActive) {
                  // Reactivate if it was soft deleted
                  await existingMapping.activate();
                  createdMappings.push(existingMapping.toObject());
                  createdCount++;
                }
                // Skip if already active
                continue;
              }

              // Create new mapping
              const mapping = new ProjectSprintRepoMapping({
                projectId,
                sprintRepoId,
                isActive: true
              });

              await mapping.save();
              createdMappings.push(mapping.toObject());
              createdCount++;
            } catch (error) {
              logger.error('Error creating mapping in bulk operation', { 
                projectId, 
                sprintRepoId, 
                error 
              });
              // Continue with other mappings
            }
          }

          logger.info('Bulk created mappings', { 
            projectId, 
            requestedCount: sprintRepoIds.length,
            createdCount 
          });

          return {
            success: true,
            createdCount,
            mappings: createdMappings
          };
        } catch (error) {
          logger.error('Error bulk creating mappings', { input, error });
          throw error;
        }
      },

      bulkDeleteProjectSprintRepoMappings: async (
        _: any,
        { input }: { input: { ids: string[] } }
      ) => {
        try {
          const { ids } = input;

          // Validate all IDs
          const invalidIds = ids.filter(id => !mongoose.Types.ObjectId.isValid(id));
          if (invalidIds.length > 0) {
            throw new AppError(`Invalid mapping IDs: ${invalidIds.join(', ')}`, 400);
          }

          let deletedCount = 0;

          // Soft delete each mapping
          for (const id of ids) {
            try {
              const mapping = await ProjectSprintRepoMapping.findById(id);
              if (mapping && mapping.isActive) {
                await mapping.deactivate();
                deletedCount++;
              }
            } catch (error) {
              logger.error('Error deleting mapping in bulk operation', { id, error });
              // Continue with other mappings
            }
          }

          logger.info('Bulk deleted mappings', { 
            requestedCount: ids.length,
            deletedCount 
          });

          return {
            success: true,
            deletedCount
          };
        } catch (error) {
          logger.error('Error bulk deleting mappings', { input, error });
          throw error;
        }
      }
    }
  }
});
