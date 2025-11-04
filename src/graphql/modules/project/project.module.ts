import { createModule, gql } from 'graphql-modules';
import { Project } from '../../../models/Project';
import { Namespace } from '../../../models/Namespace';
import { AppError } from '../../../middleware';
import { logger } from '../../../utils/logger';

export const projectModule = createModule({
  id: 'project',
  typeDefs: gql`
    type Project {
      id: ID!
      gitlabId: Int!
      name: String!
      nameWithNamespace: String!
      description: String
      defaultBranch: String!
      visibility: ProjectVisibility!
      webUrl: String!
      httpUrlToRepo: String!
      sshUrlToRepo: String!
      pathWithNamespace: String!
      namespace: ProjectNamespace!
      status: ProjectStatus!
      progress: Int!
      priority: ProjectPriority!
      category: String!
      department: String
      deadline: DateTime
      assignedTo: [ProjectAssignee!]!
      tasks: ProjectTasks!
      budget: ProjectBudget
      createdAt: DateTime!
      updatedAt: DateTime!
      lastActivityAt: DateTime!
      lastSynced: DateTime!
      isActive: Boolean!
    }

    type ProjectNamespace {
      id: Int!
      name: String!
      path: String!
      kind: String!
      fullPath: String
      membersCountWithDescendants: Int
      billableMembersCount: Int
    }

    type ProjectAssignee {
      id: String!
      name: String!
      role: String!
      department: String!
    }

    type ProjectTasks {
      total: Int!
      completed: Int!
      inProgress: Int!
      pending: Int!
    }

    type ProjectBudget {
      allocated: Float
      spent: Float
      currency: String
    }

    """
    ProjectDetails is an alias for Project for backward compatibility
    """
    type ProjectDetails {
      id: ID!
      gitlabId: Int!
      name: String!
      nameWithNamespace: String!
      description: String
      defaultBranch: String!
      visibility: ProjectVisibility!
      webUrl: String!
      httpUrlToRepo: String!
      sshUrlToRepo: String!
      pathWithNamespace: String!
      namespace: ProjectNamespace!
      status: ProjectStatus!
      progress: Int!
      priority: ProjectPriority!
      category: String!
      department: String
      deadline: DateTime
      assignedTo: [ProjectAssignee!]!
      tasks: ProjectTasks!
      budget: ProjectBudget
      createdAt: DateTime!
      updatedAt: DateTime!
      lastActivityAt: DateTime!
      lastSynced: DateTime!
      isActive: Boolean!
    }

    enum ProjectVisibility {
      PRIVATE
      INTERNAL
      PUBLIC
    }

    enum ProjectStatus {
      PLANNED
      ACTIVE
      COMPLETED
      ON_HOLD
      CANCELLED
    }

    enum ProjectPriority {
      LOW
      MEDIUM
      HIGH
      URGENT
    }

    input CreateProjectInput {
      name: String!
      description: String
      visibility: ProjectVisibility
      status: ProjectStatus
      priority: ProjectPriority
      category: String!
      department: String
      deadline: DateTime
    }

    input UpdateProjectInput {
      name: String
      description: String
      status: ProjectStatus
      priority: ProjectPriority
      progress: Int
      category: String
      department: String
      deadline: DateTime
    }

    input SyncProjectFromGitLabInput {
      gitlabProjectId: String!
    }

    type SyncProjectsResult {
      success: Boolean!
      syncedCount: Int!
      message: String!
    }

    extend type Query {
      project(id: ID!): Project
      projectDetails(projectId: ID!): ProjectDetails
      projectByGitlabId(gitlabId: Int!): Project
      projects(
        status: ProjectStatus
        priority: ProjectPriority
        department: String
        category: String
        limit: Int = 20
        offset: Int = 0
      ): [Project!]!
      projectsByNamespace(namespacePath: String!, limit: Int = 20): [Project!]!
    }

    extend type Mutation {
      updateProject(id: ID!, input: UpdateProjectInput!): Project!
      updateProjectProgress(id: ID!, progress: Int!): Project!
      assignUserToProject(
        projectId: ID!
        userId: String!
        userName: String!
        role: String!
        department: String!
      ): Project!
      unassignUserFromProject(projectId: ID!, userId: String!): Project!
      syncProjectFromGitLab(input: SyncProjectFromGitLabInput!): Project!
      syncAllProjectsFromGitLab(perPage: Int = 50): SyncProjectsResult!
    }
  `,
  resolvers: {
    Project: {
      id: (parent: any) => parent._id?.toString() || parent.id,
      nameWithNamespace: (parent: any) => parent.nameWithNamespace || parent.name || 'Unknown Project',
      defaultBranch: (parent: any) => parent.defaultBranch || 'main',
      webUrl: (parent: any) => parent.webUrl || '',
      httpUrlToRepo: (parent: any) => parent.httpUrlToRepo || '',
      sshUrlToRepo: (parent: any) => parent.sshUrlToRepo || '',
      pathWithNamespace: (parent: any) => parent.pathWithNamespace || parent.name || '',
      category: (parent: any) => parent.category || 'Uncategorized',
      status: (parent: any) => {
        // Convert DB format (lowercase with hyphen) to GraphQL format (uppercase with underscore)
        // DB: 'on-hold' -> GraphQL: 'ON_HOLD'
        const status = parent.status || 'planned';
        return status.replace(/-/g, '_').toUpperCase();
      },
      priority: (parent: any) => {
        // Convert DB format (lowercase) to GraphQL format (uppercase)
        const priority = parent.priority || 'medium';
        return priority.toUpperCase();
      },
      visibility: (parent: any) => {
        const visibility = parent.visibility || 'private';
        return visibility.toUpperCase();
      },
      progress: (parent: any) => parent.progress || 0,
      assignedTo: (parent: any) => parent.assignedTo || [],
      tasks: (parent: any) => parent.tasks || { total: 0, completed: 0, inProgress: 0, pending: 0 },
      budget: (parent: any) => {
        // Return null if budget doesn't exist
        if (!parent.budget) return null;
        // Return the budget object as-is, allowing null fields
        return parent.budget;
      },
      namespace: async (parent: any) => {
        // If no namespace, return default
        if (!parent.namespace?.id) {
          return {
            id: 0,
            name: 'Unknown',
            path: 'unknown',
            kind: 'group',
            fullPath: 'unknown',
            membersCountWithDescendants: 0,
            billableMembersCount: 0
          };
        }
        
        // Fetch full namespace data from Namespace collection
        const namespace = await Namespace.findOne({ gitlabId: parent.namespace.id }).lean();
        
        // If namespace found, return it with member counts
        if (namespace) {
          return {
            id: namespace.gitlabId,
            name: namespace.name,
            path: namespace.path,
            kind: namespace.kind,
            fullPath: namespace.fullPath,
            membersCountWithDescendants: namespace.membersCountWithDescendants || 0,
            billableMembersCount: namespace.billableMembersCount || 0
          };
        }
        
        // Fallback to embedded namespace if not found in collection
        return {
          ...parent.namespace,
          fullPath: parent.namespace.path,
          membersCountWithDescendants: 0,
          billableMembersCount: 0
        };
      },
    },
    
    // ProjectDetails resolver (alias for Project)
    ProjectDetails: {
      id: (parent: any) => parent._id?.toString() || parent.id,
      nameWithNamespace: (parent: any) => parent.nameWithNamespace || parent.name || 'Unknown Project',
      defaultBranch: (parent: any) => parent.defaultBranch || 'main',
      webUrl: (parent: any) => parent.webUrl || '',
      httpUrlToRepo: (parent: any) => parent.httpUrlToRepo || '',
      sshUrlToRepo: (parent: any) => parent.sshUrlToRepo || '',
      pathWithNamespace: (parent: any) => parent.pathWithNamespace || parent.name || '',
      category: (parent: any) => parent.category || 'Uncategorized',
      status: (parent: any) => {
        const status = parent.status || 'planned';
        return status.replace(/-/g, '_').toUpperCase();
      },
      priority: (parent: any) => {
        const priority = parent.priority || 'medium';
        return priority.toUpperCase();
      },
      visibility: (parent: any) => {
        const visibility = parent.visibility || 'private';
        return visibility.toUpperCase();
      },
      progress: (parent: any) => parent.progress || 0,
      assignedTo: (parent: any) => parent.assignedTo || [],
      tasks: (parent: any) => parent.tasks || { total: 0, completed: 0, inProgress: 0, pending: 0 },
      budget: (parent: any) => {
        // Return null if budget doesn't exist
        if (!parent.budget) return null;
        // Return the budget object as-is, allowing null fields
        return parent.budget;
      },
      namespace: async (parent: any) => {
        // If no namespace, return default
        if (!parent.namespace?.id) {
          return {
            id: 0,
            name: 'Unknown',
            path: 'unknown',
            kind: 'group',
            fullPath: 'unknown',
            membersCountWithDescendants: 0,
            billableMembersCount: 0
          };
        }
        
        // Fetch full namespace data from Namespace collection
        const namespace = await Namespace.findOne({ gitlabId: parent.namespace.id }).lean();
        
        // If namespace found, return it with member counts
        if (namespace) {
          return {
            id: namespace.gitlabId,
            name: namespace.name,
            path: namespace.path,
            kind: namespace.kind,
            fullPath: namespace.fullPath,
            membersCountWithDescendants: namespace.membersCountWithDescendants || 0,
            billableMembersCount: namespace.billableMembersCount || 0
          };
        }
        
        // Fallback to embedded namespace if not found in collection
        return {
          ...parent.namespace,
          fullPath: parent.namespace.path,
          membersCountWithDescendants: 0,
          billableMembersCount: 0
        };
      },
    },
    
    Query: {
      project: async (_: any, { id }: { id: string }) => {
        const project = await Project.findById(id).lean();
        if (!project) {
          throw new AppError('Project not found', 404);
        }
        return project;
      },

      projectDetails: async (_: any, { projectId }: { projectId: string }) => {
        const project = await Project.findById(projectId).lean();
        if (!project) {
          throw new AppError('Project not found', 404);
        }
        return project;
      },

      projectByGitlabId: async (_: any, { gitlabId }: { gitlabId: number }) => {
        const project = await Project.findByGitlabId(gitlabId);
        if (!project) {
          throw new AppError('Project not found', 404);
        }
        return project;
      },

      projects: async (
        _: any,
        { status, priority, department, category, limit = 20, offset = 0 }: any
      ) => {
        const filter: any = { isActive: true };
        // Convert GraphQL enums to DB format
        if (status) filter.status = status.toLowerCase().replace(/_/g, '-');
        if (priority) filter.priority = priority.toLowerCase();
        if (department) filter.department = department;
        if (category) filter.category = category;

        return await Project.find(filter)
          .limit(limit)
          .skip(offset)
          .sort({ lastActivityAt: -1 })
          .lean();
      },

      projectsByNamespace: async (
        _: any,
        { namespacePath, limit = 20 }: { namespacePath: string; limit: number }
      ) => {
        return await Project.find({
          'namespace.path': namespacePath,
          isActive: true,
        })
          .limit(limit)
          .sort({ lastActivityAt: -1 })
          .lean();
      },
    },

    Mutation: {
      updateProject: async (_: any, { id, input }: any) => {
        // Convert GraphQL enums to DB format
        const dbInput = { ...input };
        if (dbInput.status) dbInput.status = dbInput.status.toLowerCase().replace(/_/g, '-');
        if (dbInput.priority) dbInput.priority = dbInput.priority.toLowerCase();
        if (dbInput.visibility) dbInput.visibility = dbInput.visibility.toLowerCase();
        
        const project = await Project.findByIdAndUpdate(id, dbInput, {
          new: true,
          runValidators: true,
        });
        if (!project) {
          throw new AppError('Project not found', 404);
        }
        logger.info(`Updated project: ${project.name}`);
        return project;
      },

      updateProjectProgress: async (_: any, { id, progress }: { id: string; progress: number }) => {
        if (progress < 0 || progress > 100) {
          throw new AppError('Progress must be between 0 and 100', 400);
        }
        const project = await Project.findById(id);
        if (!project) {
          throw new AppError('Project not found', 404);
        }
        await project.updateProgress(progress);
        return await Project.findById(id).lean(); // Return updated project as lean object
      },

      assignUserToProject: async (
        _: any,
        { projectId, userId, userName, role, department }: any
      ) => {
        const project = await Project.findById(projectId);
        if (!project) {
          throw new AppError('Project not found', 404);
        }
        await project.assignUser(userId, userName, role, department);
        return await Project.findById(projectId).lean(); // Return updated project as lean object
      },

      unassignUserFromProject: async (_: any, { projectId, userId }: any) => {
        const project = await Project.findById(projectId);
        if (!project) {
          throw new AppError('Project not found', 404);
        }
        await project.unassignUser(userId);
        return await Project.findById(projectId).lean(); // Return updated project as lean object
      },

      syncProjectFromGitLab: async (_: any, { input }: any, { gitlabMCP }: any) => {
        const { gitlabProjectId } = input;
        
        logger.info(`Syncing project from GitLab: ${gitlabProjectId}`);
        
        try {
          // This would be called by the client passing GitLab data
          // Since we can't directly call MCP from resolvers, 
          // the client should fetch from GitLab and pass the data
          throw new AppError(
            'Please use the GitLab MCP directly and then call this mutation with the project data',
            501
          );
        } catch (error) {
          logger.error('Error syncing project from GitLab:', error);
          throw new AppError('Failed to sync project from GitLab', 500);
        }
      },

      syncAllProjectsFromGitLab: async (_: any, { perPage = 50 }: any) => {
        logger.info('Syncing all projects from GitLab');
        
        try {
          // This is a placeholder - actual sync should be done via separate service
          // that uses GitLab MCP and MongoDB MCP directly
          throw new AppError(
            'Project sync should be handled by external sync service using GitLab MCP',
            501
          );
        } catch (error) {
          logger.error('Error syncing projects:', error);
          throw new AppError('Failed to sync projects', 500);
        }
      },
    },
  },
});
