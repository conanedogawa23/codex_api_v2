import { createModule, gql } from 'graphql-modules';
import { Project } from '../../../models/Project';
import { User } from '../../../models/User';
import { Namespace } from '../../../models/Namespace';
import { Task } from '../../../models/Task';
import { Department } from '../../../models/Department';
import { AppError } from '../../../middleware';
import { GraphQLContext, requireCurrentUser } from '../../../utils/auth';
import { canManageDepartmentProjects } from '../../../utils/accessControl';
import { logger } from '../../../utils/logger';
import { gitlabApi } from '../../../utils/gitlabApi';
import {
  extractGitlabIdFromGid,
  isDepartmentInScope,
  requireDepartmentScope,
  requireProjectAccess,
  withProjectFilter,
} from '../../../utils/rbac';
import mongoose from 'mongoose';

type DepartmentProjectReference = {
  _id: { toString(): string };
  gitlabId?: number | null;
};

const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function buildDepartmentProjectAliases(project: DepartmentProjectReference): string[] {
  const identifiers = [project._id.toString()];

  if (project.gitlabId !== undefined && project.gitlabId !== null) {
    identifiers.push(project.gitlabId.toString());
  }

  return identifiers;
}

function requireProjectManagement(context: GraphQLContext, department?: string | null) {
  const currentUser = requireCurrentUser(context);
  if (!canManageDepartmentProjects(currentUser.accessRole, currentUser.isSuperAdmin)) {
    throw new AppError('Forbidden', 403);
  }

  if (department) {
    requireDepartmentScope(context, department);
  }

  return currentUser;
}

async function resolveProjectCreationNamespace(
  inputNamespaceId: number | null | undefined,
  departmentName: string | null | undefined,
  isSuperAdmin: boolean
): Promise<{ namespaceId: number; source: 'input' | 'department'; namespacePath?: string }> {
  if (isSuperAdmin && inputNamespaceId) {
    return {
      namespaceId: inputNamespaceId,
      source: 'input',
    };
  }

  const normalizedDepartmentName = departmentName?.trim();
  if (!normalizedDepartmentName) {
    throw new AppError(
      'Select a department with a linked GitLab namespace or provide a GitLab namespace ID.',
      400
    );
  }

  const department = await Department.findOne({
    name: { $regex: `^${escapeRegex(normalizedDepartmentName)}$`, $options: 'i' },
    isActive: true,
  })
    .select('name namespaceId')
    .lean();

  if (!department) {
    throw new AppError(`Department "${normalizedDepartmentName}" not found`, 404);
  }

  if (!department.namespaceId) {
    throw new AppError(
      `Department "${department.name}" is not linked to a GitLab namespace. Link the department before creating projects.`,
      400
    );
  }

  if (!mongoose.Types.ObjectId.isValid(department.namespaceId)) {
    throw new AppError(
      `Department "${department.name}" is linked to an invalid GitLab namespace mapping. Update the department mapping and try again.`,
      400
    );
  }

  const namespace = await Namespace.findById(department.namespaceId)
    .select('gitlabId fullPath path name')
    .lean();

  if (!namespace?.gitlabId) {
    throw new AppError(
      `Department "${department.name}" is linked to an invalid GitLab namespace. Update the department mapping and try again.`,
      400
    );
  }

  if (inputNamespaceId && inputNamespaceId !== namespace.gitlabId) {
    throw new AppError(
      `Projects for department "${department.name}" must use the linked GitLab namespace "${namespace.fullPath || namespace.path || namespace.name}".`,
      isSuperAdmin ? 400 : 403
    );
  }

  return {
    namespaceId: namespace.gitlabId,
    source: 'department',
    namespacePath: namespace.fullPath || namespace.path || namespace.name,
  };
}

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
      namespaceId: Int
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

    input ProjectFilterInput {
      status: ProjectStatus
      isActive: Boolean
      search: String
      limit: Int
      offset: Int
    }

    type OrganizationProjectsResult {
      projects: [ProjectDetails!]!
      totalCount: Int!
    }

    extend type Query {
      project(id: ID!): Project
      projectDetails(projectId: ID!): ProjectDetails
      projectByGitlabId(gitlabId: Int!): Project
      organizationProjects(filter: ProjectFilterInput): OrganizationProjectsResult!
      projects(
        status: ProjectStatus
        priority: ProjectPriority
        department: String
        category: String
        limit: Int = 20
        offset: Int = 0
      ): [Project!]!
      projectsByNamespace(namespacePath: String!, limit: Int = 20): [Project!]!
      projectsByDepartment(department: String!): [Project!]!
    }

    extend type Mutation {
      createProject(input: CreateProjectInput!): ProjectDetails!
      updateProject(id: ID!, input: UpdateProjectInput!): ProjectDetails!
      deleteProject(id: ID!): Boolean!
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
      assignedTo: async (parent: any) => {
        const gitlabId = parent.gitlabId;
        if (!gitlabId) return [];
        const gitlabGid = `gid://gitlab/Project/${gitlabId}`;
        const members = await User.find({ 'projects.id': gitlabGid }).lean();
        return members.map((user: any) => {
          const projectEntry = user.projects?.find((p: any) => p.id === gitlabGid);
          return {
            id: user._id.toString(),
            name: user.name,
            role: projectEntry?.role || user.role || 'Member',
            department: user.department || 'Unknown',
          };
        });
      },
      tasks: (parent: any) => parent.tasks || { total: 0, completed: 0, inProgress: 0, pending: 0 },
      budget: (parent: any) => {
        // Return null if budget doesn't exist
        if (!parent.budget) return null;
        // Return the budget object as-is, allowing null fields
        return parent.budget;
      },
      namespace: async (parent: any) => {
        // Skip DB lookup if namespace was batch-resolved upstream (e.g. by projectsWithCommitActivity)
        if (parent._namespaceBatchResolved) {
          return parent._namespaceBatchResolved;
        }

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
      assignedTo: async (parent: any) => {
        const gitlabId = parent.gitlabId;
        if (!gitlabId) return [];
        const gitlabGid = `gid://gitlab/Project/${gitlabId}`;
        const members = await User.find({ 'projects.id': gitlabGid }).lean();
        return members.map((user: any) => {
          const projectEntry = user.projects?.find((p: any) => p.id === gitlabGid);
          return {
            id: user._id.toString(),
            name: user.name,
            role: projectEntry?.role || user.role || 'Member',
            department: user.department || 'Unknown',
          };
        });
      },
      tasks: (parent: any) => parent.tasks || { total: 0, completed: 0, inProgress: 0, pending: 0 },
      budget: (parent: any) => {
        // Return null if budget doesn't exist
        if (!parent.budget) return null;
        // Return the budget object as-is, allowing null fields
        return parent.budget;
      },
      namespace: async (parent: any) => {
        // Skip DB lookup if namespace was batch-resolved upstream (e.g. by projectsWithCommitActivity)
        if (parent._namespaceBatchResolved) {
          return parent._namespaceBatchResolved;
        }

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
      project: async (_: any, { id }: { id: string }, context: GraphQLContext) => {
        requireCurrentUser(context);
        const project = await Project.findById(id).lean();
        if (!project) {
          throw new AppError('Project not found', 404);
        }

        await requireProjectAccess(context, project._id?.toString() || id);
        return project;
      },

      projectDetails: async (_: any, { projectId }: { projectId: string }, context: GraphQLContext) => {
        requireCurrentUser(context);
        const project = await Project.findById(projectId).lean();
        if (!project) {
          throw new AppError('Project not found', 404);
        }

        await requireProjectAccess(context, project._id?.toString() || projectId);
        return project;
      },

      projectByGitlabId: async (_: any, { gitlabId }: { gitlabId: number }, context: GraphQLContext) => {
        requireCurrentUser(context);
        const project = await Project.findByGitlabId(gitlabId);
        if (!project) {
          throw new AppError('Project not found', 404);
        }

        await requireProjectAccess(context, project.gitlabId, 'gitlab');
        return project;
      },

      organizationProjects: async (
        _: any,
        {
          filter,
        }: {
          filter?: {
            isActive?: boolean;
            limit?: number;
            offset?: number;
            search?: string;
            status?: string;
          };
        },
        context: GraphQLContext
      ) => {
        try {
          requireCurrentUser(context);
          const query: any = {};

          if (filter) {
            if (filter.status !== undefined) {
              query.status = filter.status.toLowerCase().replace(/_/g, '-');
            }

            if (filter.isActive !== undefined) {
              query.isActive = filter.isActive;
            }

            if (filter.search?.trim()) {
              const escapedSearch = escapeRegex(filter.search.trim());

              query.$or = [
                { name: { $regex: escapedSearch, $options: 'i' } },
                { nameWithNamespace: { $regex: escapedSearch, $options: 'i' } },
              ];
            }
          } else {
            query.isActive = true;
          }

          const limit = filter?.limit || 100;
          const offset = filter?.offset || 0;
          const scopedQuery = await withProjectFilter(context, query, '_id');

          const [projects, totalCount] = await Promise.all([
            Project.find(scopedQuery)
              .select('gitlabId name nameWithNamespace description defaultBranch visibility webUrl httpUrlToRepo sshUrlToRepo pathWithNamespace namespace status progress priority category department deadline tasks budget assignedTo createdAt updatedAt lastActivityAt lastSynced isActive')
              .limit(limit)
              .skip(offset)
              .sort({ lastActivityAt: -1 })
              .lean(),
            Project.countDocuments(scopedQuery),
          ]);

          return {
            projects,
            totalCount,
          };
        } catch (error) {
          logger.error('Error fetching organization projects', {
            error,
            filter,
          });
          throw new AppError('Failed to fetch organization projects', 500);
        }
      },

      projects: async (
        _: any,
        { status, priority, department, category, limit = 20, offset = 0 }: any,
        context: GraphQLContext
      ) => {
        const startTime = Date.now();
        const currentUser = requireCurrentUser(context);
        const filter: any = { isActive: true };
        
        logger.info('Projects query received', { 
          userId: currentUser.userId,
          accessRole: currentUser.accessRole,
          isSuperAdmin: currentUser.isSuperAdmin,
          status, 
          department, 
          category,
          limit,
          offset,
        });
        
        // Convert GraphQL enums to DB format
        if (status) filter.status = status.toLowerCase().replace(/_/g, '-');
        if (priority) filter.priority = priority.toLowerCase();
        if (department) {
          filter.department = currentUser.isSuperAdmin
            ? department
            : requireDepartmentScope(context, department);
        }
        if (category) filter.category = category;
        const scopedFilter = await withProjectFilter(context, filter, '_id');

        // Select only fields needed by the GraphQL schema to reduce payload
        const dbStart = Date.now();
        const projects = await Project.find(scopedFilter)
          .select('gitlabId name nameWithNamespace description defaultBranch visibility webUrl httpUrlToRepo sshUrlToRepo pathWithNamespace namespace status progress priority category department deadline tasks budget assignedTo createdAt updatedAt lastActivityAt lastSynced isActive')
          .limit(limit)
          .skip(offset)
          .sort({ lastActivityAt: -1 })
          .lean();

        const dbDuration = Date.now() - dbStart;
        const totalDuration = Date.now() - startTime;
        logger.info('Projects query completed', { 
          count: projects.length, 
          dbDurationMs: dbDuration,
          totalDurationMs: totalDuration,
        });

        return projects;
      },

      projectsByNamespace: async (
        _: any,
        { namespacePath, limit = 20 }: { namespacePath: string; limit: number },
        context: GraphQLContext
      ) => {
        requireCurrentUser(context);

        const filter = await withProjectFilter(context, {
          'namespace.path': namespacePath,
          isActive: true,
        }, '_id');

        return await Project.find(filter)
          .limit(limit)
          .sort({ lastActivityAt: -1 })
          .lean();
      },

      projectsByDepartment: async (
        _: any,
        { department }: { department: string },
        context: GraphQLContext
      ) => {
        const currentUser = requireCurrentUser(context);
        logger.info('Fetching projects by department', {
          department,
          userId: currentUser.userId,
          accessRole: currentUser.accessRole,
          isSuperAdmin: currentUser.isSuperAdmin,
        });

        if (!currentUser.isSuperAdmin) {
          requireDepartmentScope(context, department);
        }
        
        // Get the department document
        const dept = await Department.findOne({ name: department }).lean();
        
        if (!dept || !dept.projects || dept.projects.length === 0) {
          logger.info('No projects found for department', { department });
          return [];
        }

        const projectIdentifiers: string[] = dept.projects;
        const gitlabIds = projectIdentifiers
          .filter((id: string) => /^\d+$/.test(id))
          .map((id: string) => Number(id));
        const objectIds = projectIdentifiers
          .filter((id: string) => mongoose.Types.ObjectId.isValid(id))
          .map((id: string) => new mongoose.Types.ObjectId(id));

        if (gitlabIds.length === 0 && objectIds.length === 0) {
          return [];
        }

        const identifierFilter: Array<Record<string, unknown>> = [];

        if (gitlabIds.length > 0) {
          identifierFilter.push({ gitlabId: { $in: gitlabIds } });
        }

        if (objectIds.length > 0) {
          identifierFilter.push({ _id: { $in: objectIds } });
        }

        const filter: any = {
          $and: [
            { isActive: true },
            { $or: identifierFilter },
          ],
        };

        const scopedFilter = await withProjectFilter(context, filter, '_id');
        
        const projects = await Project.find(scopedFilter)
          .sort({ lastActivityAt: -1 })
          .lean();

        const projectOrder = new Map(
          projectIdentifiers.map((identifier: string, index: number) => [identifier, index])
        );
        
        logger.info('Found projects for department', { 
          department, 
          projectCount: projects.length 
        });
        
        return projects.sort((left, right) => {
          const leftIndex = buildDepartmentProjectAliases(left)
            .map((identifier) => projectOrder.get(identifier))
            .find((index): index is number => index !== undefined) ?? Number.MAX_SAFE_INTEGER;
          const rightIndex = buildDepartmentProjectAliases(right)
            .map((identifier) => projectOrder.get(identifier))
            .find((index): index is number => index !== undefined) ?? Number.MAX_SAFE_INTEGER;

          return leftIndex - rightIndex;
        });
      },
    },

    Mutation: {
      createProject: async (_: any, { input }: any, context: GraphQLContext) => {
        try {
          const currentUser = requireProjectManagement(context, input.department || undefined);
          const scopedDepartment = currentUser.isSuperAdmin
            ? input.department
            : requireDepartmentScope(context, input.department || currentUser.department);

          const resolvedNamespace = await resolveProjectCreationNamespace(
            input.namespaceId,
            scopedDepartment,
            currentUser.isSuperAdmin
          );

          logger.info('Creating new project', {
            name: input.name,
            requestedNamespaceId: input.namespaceId,
            resolvedNamespaceId: resolvedNamespace.namespaceId,
            namespaceSource: resolvedNamespace.source,
            department: scopedDepartment,
            namespacePath: resolvedNamespace.namespacePath,
          });

          // Step 1: Create project in GitLab
          const gitlabProject = await gitlabApi.createProject({
            name: input.name,
            description: input.description,
            visibility: input.visibility?.toLowerCase() as 'private' | 'internal' | 'public',
            namespace_id: resolvedNamespace.namespaceId,
          });

          logger.info('GitLab project created successfully', {
            gitlabId: gitlabProject.id,
            name: gitlabProject.name,
          });

          // Step 2: Create project in MongoDB with GitLab data + custom fields
          const now = new Date();
          const projectData = {
            gitlabId: gitlabProject.id,
            name: gitlabProject.name,
            nameWithNamespace: gitlabProject.name_with_namespace,
            description: gitlabProject.description,
            defaultBranch: gitlabProject.default_branch,
            visibility: gitlabProject.visibility,
            webUrl: gitlabProject.web_url,
            httpUrlToRepo: gitlabProject.http_url_to_repo,
            sshUrlToRepo: gitlabProject.ssh_url_to_repo,
            pathWithNamespace: gitlabProject.path_with_namespace,
            namespace: {
              id: gitlabProject.namespace.id,
              name: gitlabProject.namespace.name,
              path: gitlabProject.namespace.path,
              kind: gitlabProject.namespace.kind,
            },
            // Custom management fields
            status: input.status?.toLowerCase().replace(/_/g, '-') || 'planned',
            priority: input.priority?.toLowerCase() || 'medium',
            category: input.category || 'Uncategorized',
            department: scopedDepartment,
            deadline: input.deadline,
            progress: 0,
            tasks: {
              total: 0,
              completed: 0,
              inProgress: 0,
              pending: 0,
            },
            createdAt: new Date(gitlabProject.created_at),
            updatedAt: now,
            lastActivityAt: new Date(gitlabProject.last_activity_at),
            lastSynced: now,
            isActive: true,
          };

          const project = new Project(projectData);
          await project.save();

          logger.info('Project saved to MongoDB', {
            id: project._id,
            gitlabId: project.gitlabId,
            name: project.name,
          });

          return project;
        } catch (error) {
          logger.error('Failed to create project', { error, input });
          
          // If error is from GitLab, it's already formatted as AppError
          if (error instanceof AppError) {
            throw error;
          }
          
          // Handle other errors
          throw new AppError('Failed to create project', 500);
        }
      },

      updateProject: async (_: any, { id, input }: any, context: GraphQLContext) => {
        const existingProject = await Project.findById(id).lean();
        if (!existingProject) {
          throw new AppError('Project not found', 404);
        }

        requireProjectManagement(context, existingProject.department);
        await requireProjectAccess(context, existingProject._id?.toString() || id);

        // Convert GraphQL enums to DB format
        const dbInput = { ...input };
        if (dbInput.status) dbInput.status = dbInput.status.toLowerCase().replace(/_/g, '-');
        if (dbInput.priority) dbInput.priority = dbInput.priority.toLowerCase();
        if (dbInput.visibility) dbInput.visibility = dbInput.visibility.toLowerCase();

        if (dbInput.department) {
          requireDepartmentScope(context, dbInput.department);
        }
        
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

      updateProjectProgress: async (
        _: any,
        { id, progress }: { id: string; progress: number },
        context: GraphQLContext
      ) => {
        if (progress < 0 || progress > 100) {
          throw new AppError('Progress must be between 0 and 100', 400);
        }
        const project = await Project.findById(id);
        if (!project) {
          throw new AppError('Project not found', 404);
        }
        requireProjectManagement(context, project.department);
        await requireProjectAccess(context, project._id?.toString() || id);
        await project.updateProgress(progress);
        return await Project.findById(id).lean(); // Return updated project as lean object
      },

      assignUserToProject: async (
        _: any,
        { projectId, userId, userName, role, department }: any,
        context: GraphQLContext
      ) => {
        const project = await Project.findById(projectId).lean();
        if (!project) {
          throw new AppError('Project not found', 404);
        }

        const currentUser = requireProjectManagement(context, project.department);
        await requireProjectAccess(context, project._id?.toString() || projectId);

        const user = await User.findById(userId);
        if (!user) {
          throw new AppError('User not found', 404);
        }

        if (!currentUser.isSuperAdmin) {
          if (!isDepartmentInScope(currentUser, user.department)) {
            throw new AppError('Cannot assign users outside your department scope', 403);
          }

          if (department && !isDepartmentInScope(currentUser, department)) {
            throw new AppError('Cannot assign a project with a mismatched department', 403);
          }
        }

        // Store as GitLab GID format for RBAC compatibility
        const gitlabGid = project.gitlabId
          ? `gid://gitlab/Project/${project.gitlabId}`
          : projectId;

        await user.addProject(gitlabGid, project.name, role);
        logger.info('User assigned to project via user.projects[]', {
          userId,
          userName,
          projectId,
          gitlabGid,
          projectName: project.name,
          role,
        });

        return project;
      },

      unassignUserFromProject: async (_: any, { projectId, userId }: any, context: GraphQLContext) => {
        let project = null;

        // Try MongoDB ObjectId lookup first
        if (mongoose.Types.ObjectId.isValid(projectId)) {
          project = await Project.findById(projectId).lean();
        }

        // If not found and projectId looks like a GID, extract gitlabId and search
        if (!project) {
          const gitlabId = extractGitlabIdFromGid(projectId);
          if (gitlabId) {
            project = await Project.findOne({ gitlabId }).lean();
          }
        }

        if (!project) {
          throw new AppError('Project not found', 404);
        }

        const currentUser = requireProjectManagement(context, project.department);
        await requireProjectAccess(context, project._id?.toString() || projectId);

        const user = await User.findById(userId);
        if (!user) {
          throw new AppError('User not found', 404);
        }

        if (!currentUser.isSuperAdmin && !isDepartmentInScope(currentUser, user.department)) {
          throw new AppError('Cannot unassign users outside your department scope', 403);
        }

        // Use GitLab GID format to match the stored format
        const gitlabGid = project.gitlabId
          ? `gid://gitlab/Project/${project.gitlabId}`
          : projectId;

        await user.removeProject(gitlabGid);
        logger.info('User removed from project via user.projects[]', {
          userId,
          projectId,
          gitlabGid,
        });

        return project;
      },

      deleteProject: async (_: any, { id }: { id: string }, context: GraphQLContext) => {
        logger.info('Attempting to delete project', { projectId: id });

        // Step 1: Check if project exists
        const project = await Project.findById(id);
        if (!project) {
          throw new AppError('Project not found', 404);
        }

        requireProjectManagement(context, project.department);
        await requireProjectAccess(context, project._id?.toString() || id);

        // Step 2: Check for active tasks
        const activeTasksCount = await Task.countDocuments({
          projectId: id,
          isActive: true,
        });

        if (activeTasksCount > 0) {
          logger.warn('Cannot delete project with active tasks', {
            projectId: id,
            activeTasksCount,
          });
          throw new AppError(
            `Cannot delete project with ${activeTasksCount} active task(s). Please complete or delete tasks first.`,
            400
          );
        }

        // Step 3: Soft delete (set isActive to false)
        await Project.findByIdAndUpdate(id, { isActive: false });

        logger.info('Project soft deleted successfully', {
          projectId: id,
          name: project.name,
        });

        return true;
      },

      syncProjectFromGitLab: async (_: any, { input }: any, context: GraphQLContext) => {
        requireProjectManagement(context);
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

      syncAllProjectsFromGitLab: async (_: any, { perPage = 50 }: any, context: GraphQLContext) => {
        requireProjectManagement(context);
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
