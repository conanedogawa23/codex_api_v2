import { createModule, gql } from 'graphql-modules';
import mongoose from 'mongoose';
import { Department } from '../../../models/Department';
import { User } from '../../../models/User';
import { Project } from '../../../models/Project';
import { Namespace } from '../../../models/Namespace';
import { AppError } from '../../../middleware';
import { GraphQLContext, requireCurrentUser } from '../../../utils/auth';
import { canManageDepartmentProjects, canManageDepartmentUsers } from '../../../utils/accessControl';
import { logger } from '../../../utils/logger';
import { fixDepartmentData } from '../../../utils/migrations/fixDepartmentData';
import { requireDepartmentScope } from '../../../utils/rbac';

type DepartmentMemberUser = {
  _id: { toString(): string };
  gitlabId?: number | null;
  isActive?: boolean;
  userSource?: string;
  userType?: string;
};

type DepartmentProjectRecord = {
  _id: { toString(): string };
  department?: string;
  gitlabId?: number | null;
  isActive?: boolean;
};

const ACTIVE_HUMAN_DEPARTMENT_MEMBER_FILTER = {
  isActive: true,
  $or: [
    { userType: 'human' },
    { userType: { $exists: false }, userSource: 'manual' },
  ],
};

function buildDepartmentMemberIdentifier(user: DepartmentMemberUser): string {
  if (user.gitlabId !== undefined && user.gitlabId !== null) {
    return user.gitlabId.toString();
  }

  return user._id.toString();
}

function buildDepartmentMemberAliases(user: DepartmentMemberUser): string[] {
  const identifiers = [user._id.toString()];

  if (user.gitlabId !== undefined && user.gitlabId !== null) {
    identifiers.push(user.gitlabId.toString());
  }

  return identifiers;
}

function isEligibleDepartmentMember(user: DepartmentMemberUser | null | undefined): user is DepartmentMemberUser {
  if (!user || user.isActive === false) {
    return false;
  }

  if (user.userType) {
    return user.userType === 'human';
  }

  return user.userSource === 'manual';
}

async function findUserByDepartmentMemberIdentifier(memberIdentifier: string) {
  const trimmedIdentifier = memberIdentifier.trim();

  if (!trimmedIdentifier) {
    return null;
  }

  if (mongoose.Types.ObjectId.isValid(trimmedIdentifier)) {
    const userById = await User.findById(trimmedIdentifier);

    if (userById) {
      return userById;
    }
  }

  if (/^\d+$/.test(trimmedIdentifier)) {
    return User.findOne({ gitlabId: Number(trimmedIdentifier) });
  }

  return null;
}

function buildDepartmentProjectIdentifier(project: DepartmentProjectRecord): string {
  if (project.gitlabId !== undefined && project.gitlabId !== null) {
    return project.gitlabId.toString();
  }

  return project._id.toString();
}

function buildDepartmentProjectAliases(project: DepartmentProjectRecord): string[] {
  const identifiers = [project._id.toString()];

  if (project.gitlabId !== undefined && project.gitlabId !== null) {
    identifiers.push(project.gitlabId.toString());
  }

  return identifiers;
}

async function findProjectByDepartmentProjectIdentifier(projectIdentifier: string) {
  const trimmedIdentifier = projectIdentifier.trim();

  if (!trimmedIdentifier) {
    return null;
  }

  if (mongoose.Types.ObjectId.isValid(trimmedIdentifier)) {
    const projectById = await Project.findById(trimmedIdentifier);

    if (projectById) {
      return projectById;
    }
  }

  if (/^\d+$/.test(trimmedIdentifier)) {
    return Project.findOne({ gitlabId: Number(trimmedIdentifier) });
  }

  return null;
}

function requireDepartmentVisibility(context: GraphQLContext, departmentName: string) {
  const currentUser = requireCurrentUser(context);
  if (!currentUser.isSuperAdmin) {
    requireDepartmentScope(context, departmentName);
  }
  return currentUser;
}

function requireDepartmentUserManagement(context: GraphQLContext, departmentName: string) {
  const currentUser = requireCurrentUser(context);
  if (!canManageDepartmentUsers(currentUser.accessRole, currentUser.isSuperAdmin)) {
    throw new AppError('Forbidden', 403);
  }
  requireDepartmentScope(context, departmentName);
  return currentUser;
}

function requireDepartmentProjectManagement(context: GraphQLContext, departmentName: string) {
  const currentUser = requireCurrentUser(context);
  if (!canManageDepartmentProjects(currentUser.accessRole, currentUser.isSuperAdmin)) {
    throw new AppError('Forbidden', 403);
  }
  requireDepartmentScope(context, departmentName);
  return currentUser;
}

function requirePlatformSuperAdmin(context: GraphQLContext) {
  const currentUser = requireCurrentUser(context);
  if (!currentUser.isSuperAdmin) {
    throw new AppError('Forbidden', 403);
  }
  return currentUser;
}

export const departmentModule = createModule({
  id: 'department',
  typeDefs: gql`
    type Department {
      id: ID!
      gitlabId: Int
      name: String!
      description: String
      namespaceId: String
      namespace: Namespace
      head: DepartmentHead
      memberIds: [String!]!
      members: [User!]!
      projectIds: [String!]!
      projects: [Project!]!
      budget: Float
      location: String
      isActive: Boolean!
      memberCount: Int!
      projectCount: Int!
      createdAt: DateTime!
      updatedAt: DateTime!
    }

    type DepartmentHead {
      id: String!
      name: String!
      email: String!
    }

    input DepartmentHeadInput {
      id: String!
      name: String!
      email: String!
    }

    extend type Query {
      department(id: ID!): Department
      departmentByName(name: String!): Department
      departments(isActive: Boolean, limit: Int = 20, offset: Int = 0): [Department!]!
      activeDepartments: [Department!]!
    }

    type MigrationResult {
      success: Boolean!
      message: String!
      departments: Int!
      humanUsers: Int!
      nonHumanAccounts: Int!
      details: [DepartmentSyncDetail!]!
    }

    type DepartmentSyncDetail {
      name: String!
      arraySize: Int!
      actualUsers: Int!
    }

    input CreateDepartmentInput {
      name: String!
      description: String
      head: DepartmentHeadInput
      budget: Float
      location: String
    }

    input UpdateDepartmentInput {
      name: String
      description: String
      head: DepartmentHeadInput
      budget: Float
      location: String
      isActive: Boolean
    }

    extend type Mutation {
      createDepartment(input: CreateDepartmentInput!): Department!
      updateDepartment(id: ID!, input: UpdateDepartmentInput!): Department!
      addMemberToDepartment(departmentId: ID!, userId: String!): Department!
      removeMemberFromDepartment(departmentId: ID!, userId: String!): Department!
      addProjectToDepartment(departmentId: ID!, projectId: String!): Department!
      removeProjectFromDepartment(departmentId: ID!, projectId: String!): Department!
      syncDepartmentMembers(departmentId: ID!): Department!
      syncAllDepartments: [Department!]!
      linkDepartmentToNamespace(departmentId: ID!, namespaceId: String!): Department!
      unlinkDepartmentFromNamespace(departmentId: ID!): Department!
      runDepartmentMigration: MigrationResult!
    }
  `,
  resolvers: {
    Department: {
      id: (parent: any) => parent._id?.toString() || parent.id,
      memberIds: (parent: any) => parent.members || [],
      memberCount: (parent: any) => parent.members?.length || 0,
      projectIds: (parent: any) => parent.projects || [],
      projectCount: (parent: any) => parent.projects?.length || 0,
      
      // Resolve members as User objects
      members: async (parent: any, _: any, context: GraphQLContext) => {
        requireDepartmentVisibility(context, parent.name);
        if (!parent.members || parent.members.length === 0) {
          return [];
        }

        const memberIdentifiers: string[] = parent.members;
        const gitlabIds = memberIdentifiers
          .filter((id: string) => /^\d+$/.test(id))
          .map((id: string) => Number(id));
        const objectIds = memberIdentifiers
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

        const users = await User.find({
          $and: [
            ACTIVE_HUMAN_DEPARTMENT_MEMBER_FILTER,
            { $or: identifierFilter },
          ],
        }).lean();

        const memberOrder = new Map(
          memberIdentifiers.map((identifier: string, index: number) => [identifier, index])
        );

        return users
          .filter(isEligibleDepartmentMember)
          .sort((left, right) => {
            const leftIndex = buildDepartmentMemberAliases(left)
              .map((identifier) => memberOrder.get(identifier))
              .find((index): index is number => index !== undefined) ?? Number.MAX_SAFE_INTEGER;
            const rightIndex = buildDepartmentMemberAliases(right)
              .map((identifier) => memberOrder.get(identifier))
              .find((index): index is number => index !== undefined) ?? Number.MAX_SAFE_INTEGER;

            return leftIndex - rightIndex;
          });
      },
      
      // Resolve projects as Project objects
      projects: async (parent: any, _: any, context: GraphQLContext) => {
        requireDepartmentVisibility(context, parent.name);
        if (!parent.projects || parent.projects.length === 0) {
          return [];
        }

        const projectIdentifiers: string[] = parent.projects;
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

        const projects = await Project.find({
          $and: [
            { isActive: true },
            { $or: identifierFilter },
          ],
        }).lean();

        const projectOrder = new Map(
          projectIdentifiers.map((identifier: string, index: number) => [identifier, index])
        );

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
      
      // Resolve namespace if linked
      namespace: async (parent: any) => {
        if (!parent.namespaceId) {
          return null;
        }
        
        const namespace = await Namespace.findById(parent.namespaceId).lean();
        return namespace;
      },
    },
    
    Query: {
      department: async (_: any, { id }: { id: string }, context: GraphQLContext) => {
        logger.info('Fetching department by ID', { id });
        
        const department = await Department.findById(id).lean();
        
        if (!department) {
          throw new AppError(`Department with ID ${id} not found`, 404);
        }

        requireDepartmentVisibility(context, department.name);
        
        return department;
      },

      departmentByName: async (_: any, { name }: { name: string }, context: GraphQLContext) => {
        logger.info('Fetching department by name', { name });
        
        const department = await Department.findOne({ name }).lean();
        
        if (!department) {
          throw new AppError(`Department with name ${name} not found`, 404);
        }

        requireDepartmentVisibility(context, department.name);
        
        return department;
      },

      departments: async (
        _: any,
        { isActive, limit, offset }: { isActive?: boolean; limit: number; offset: number },
        context: GraphQLContext
      ) => {
        logger.info('Fetching departments', { isActive, limit, offset });

        const currentUser = requireCurrentUser(context);
        const filter: any = {};
        if (isActive !== undefined) filter.isActive = isActive;

        if (!currentUser.isSuperAdmin) {
          filter.name = requireDepartmentScope(context, currentUser.department);
        }
        
        return await Department.find(filter)
          .limit(limit)
          .skip(offset)
          .sort({ name: 1 })
          .lean();
      },

      activeDepartments: async (_: any, __: any, context: GraphQLContext) => {
        logger.info('Fetching active departments');

        const currentUser = requireCurrentUser(context);
        const filter = currentUser.isSuperAdmin
          ? { isActive: true }
          : {
              isActive: true,
              name: requireDepartmentScope(context, currentUser.department),
            };

        return await Department.find(filter)
          .sort({ name: 1 })
          .lean();
      },
    },

    Mutation: {
      updateDepartment: async (
        _: any,
        { id, input }: { id: string; input: { name?: string; description?: string; head?: { id: string; name: string; email: string }; budget?: number; location?: string; isActive?: boolean } },
        context: GraphQLContext
      ) => {
        requirePlatformSuperAdmin(context);
        logger.info('Updating department', { id, fields: Object.keys(input) });

        const department = await Department.findById(id);
        if (!department) {
          throw new AppError(`Department with ID ${id} not found`, 404);
        }

        // Check for duplicate name if renaming
        if (input.name && input.name !== department.name) {
          const existing = await Department.findOne({ name: input.name, _id: { $ne: id } }).lean();
          if (existing) {
            throw new AppError(`Department with name "${input.name}" already exists`, 400);
          }
        }

        // Apply updates for provided fields only
        if (input.name !== undefined) department.name = input.name;
        if (input.description !== undefined) department.description = input.description;
        if (input.head !== undefined) department.head = input.head;
        if (input.budget !== undefined) department.budget = input.budget;
        if (input.location !== undefined) department.location = input.location;
        if (input.isActive !== undefined) department.isActive = input.isActive;

        await department.save();

        const updated = await Department.findById(id).lean();
        logger.info('Department updated successfully', { id, name: updated?.name });
        return updated!;
      },

      createDepartment: async (
        _: any,
        { input }: { input: { name: string; description?: string; head?: { id: string; name: string; email: string }; budget?: number; location?: string } },
        context: GraphQLContext
      ) => {
        requirePlatformSuperAdmin(context);
        logger.info('Creating new department', { name: input.name });

        // Check for duplicate name
        const existing = await Department.findOne({ name: input.name }).lean();
        if (existing) {
          throw new AppError(`Department with name "${input.name}" already exists`, 400);
        }

        const department = new Department({
          name: input.name,
          description: input.description || '',
          head: input.head || undefined,
          budget: input.budget || 0,
          location: input.location || '',
          members: [],
          projects: [],
          isActive: true,
        });

        await department.save();

        const created = await Department.findById(department._id).lean();
        logger.info('Department created successfully', { id: department._id, name: input.name });
        return created!;
      },

      addMemberToDepartment: async (
        _: any,
        { departmentId, userId }: { departmentId: string; userId: string },
        context: GraphQLContext
      ) => {
        logger.info('Adding member to department', { departmentId, userId });
        
        const department = await Department.findById(departmentId);
        
        if (!department) {
          throw new AppError(`Department with ID ${departmentId} not found`, 404);
        }

        const currentUser = requireDepartmentUserManagement(context, department.name);

        const user = await findUserByDepartmentMemberIdentifier(userId);
        
        if (!user) {
          throw new AppError(`User with identifier ${userId} not found`, 404);
        }

        const memberType = user.userType || user.userSource || 'unknown';

        if (!isEligibleDepartmentMember(user)) {
          throw new AppError(`Cannot add non-human account (${memberType}) to department`, 400);
        }

        if (!currentUser.isSuperAdmin && user.isSuperAdmin) {
          throw new AppError('Forbidden', 403);
        }

        if (
          !currentUser.isSuperAdmin &&
          user.department &&
          user.department !== department.name &&
          user.department !== 'General'
        ) {
          throw new AppError('Cannot reassign a user from another department', 403);
        }

        const memberIdentifier = buildDepartmentMemberIdentifier(user);
        const memberAliases = new Set(buildDepartmentMemberAliases(user));
        const alreadyMember = department.members.some((memberId: string) => memberAliases.has(memberId));

        if (!alreadyMember) {
          await department.addMember(memberIdentifier);
        }
        
        // SYNC: Update user's department field
        user.department = department.name;

        if (!user.userType && user.userSource === 'manual') {
          user.userType = 'human';
        }

        await user.save();
        
        const updated = await Department.findById(departmentId).lean();
        logger.info('Member added to department and user.department synced', {
          departmentId,
          userId,
          storedMemberIdentifier: memberIdentifier,
          departmentName: department.name,
        });
        return updated!;
      },

      removeMemberFromDepartment: async (
        _: any,
        { departmentId, userId }: { departmentId: string; userId: string },
        context: GraphQLContext
      ) => {
        logger.info('Removing member from department', { departmentId, userId });
        
        const department = await Department.findById(departmentId);
        
        if (!department) {
          throw new AppError(`Department with ID ${departmentId} not found`, 404);
        }

        const currentUser = requireDepartmentUserManagement(context, department.name);

        const user = await findUserByDepartmentMemberIdentifier(userId);
        const identifiersToRemove = new Set([userId]);

        if (user) {
          if (!currentUser.isSuperAdmin && user.isSuperAdmin) {
            throw new AppError('Forbidden', 403);
          }
          if (!currentUser.isSuperAdmin && user.department !== department.name) {
            throw new AppError('Cannot remove a user outside your department scope', 403);
          }
          buildDepartmentMemberAliases(user).forEach((identifier) => identifiersToRemove.add(identifier));
        }

        department.members = department.members.filter(
          (memberId: string) => !identifiersToRemove.has(memberId)
        );
        await department.save();
        
        // SYNC: Update user's department field to empty or default
        if (user) {
          user.department = 'General'; // Move to General department instead of leaving empty

          if (!user.userType && user.userSource === 'manual') {
            user.userType = 'human';
          }

          await user.save();
          logger.info('User moved to General department', {
            userId,
            removedIdentifiers: Array.from(identifiersToRemove),
          });
        }
        
        const updated = await Department.findById(departmentId).lean();
        logger.info('Member removed from department successfully', { departmentId, userId });
        return updated!;
      },

      addProjectToDepartment: async (
        _: any,
        { departmentId, projectId }: { departmentId: string; projectId: string },
        context: GraphQLContext
      ) => {
        logger.info('Adding project to department', { departmentId, projectId });
        
        const department = await Department.findById(departmentId);
        
        if (!department) {
          throw new AppError(`Department with ID ${departmentId} not found`, 404);
        }

        const currentUser = requireDepartmentProjectManagement(context, department.name);

        const project = await findProjectByDepartmentProjectIdentifier(projectId);

        if (!project) {
          throw new AppError(`Project with identifier ${projectId} not found`, 404);
        }

        if (project.isActive === false) {
          throw new AppError(`Cannot add inactive project ${projectId} to department`, 400);
        }

        if (!currentUser.isSuperAdmin && project.department && project.department !== department.name) {
          throw new AppError('Cannot reassign a project from another department', 403);
        }

        const projectIdentifier = buildDepartmentProjectIdentifier(project);
        const projectAliases = buildDepartmentProjectAliases(project);
        const projectAliasSet = new Set(projectAliases);
        const firstExistingIndex = department.projects.findIndex((storedProjectId: string) =>
          projectAliasSet.has(storedProjectId)
        );

        if (firstExistingIndex === -1) {
          department.projects.push(projectIdentifier);
        } else {
          department.projects = department.projects.filter((storedProjectId: string, index: number) => {
            return index === firstExistingIndex || !projectAliasSet.has(storedProjectId);
          });
          department.projects[firstExistingIndex] = projectIdentifier;
        }

        const reassignmentResult = await Department.updateMany(
          {
            _id: { $ne: department._id },
            projects: { $in: projectAliases },
          },
          {
            $pull: {
              projects: { $in: projectAliases },
            },
          }
        );

        await department.save();
        project.department = department.name;
        await project.save();
        
        const updated = await Department.findById(departmentId).lean();
        logger.info('Project added to department successfully', {
          departmentId,
          projectId,
          reassignedDepartmentCount: reassignmentResult.modifiedCount || 0,
          storedProjectIdentifier: projectIdentifier,
        });
        return updated!;
      },

      removeProjectFromDepartment: async (
        _: any,
        { departmentId, projectId }: { departmentId: string; projectId: string },
        context: GraphQLContext
      ) => {
        logger.info('Removing project from department', { departmentId, projectId });
        
        const department = await Department.findById(departmentId);
        
        if (!department) {
          throw new AppError(`Department with ID ${departmentId} not found`, 404);
        }

        const currentUser = requireDepartmentProjectManagement(context, department.name);

        const project = await findProjectByDepartmentProjectIdentifier(projectId);
        const identifiersToRemove = new Set([projectId]);

        if (project) {
          if (!currentUser.isSuperAdmin && project.department && project.department !== department.name) {
            throw new AppError('Cannot remove a project outside your department scope', 403);
          }
          buildDepartmentProjectAliases(project).forEach((identifier) => identifiersToRemove.add(identifier));
        }

        department.projects = department.projects.filter(
          (storedProjectId: string) => !identifiersToRemove.has(storedProjectId)
        );
        await department.save();

        if (project && project.department === department.name) {
          project.department = '';
          await project.save();
        }
        
        const updated = await Department.findById(departmentId).lean();
        logger.info('Project removed from department successfully', {
          departmentId,
          projectId,
          removedIdentifiers: Array.from(identifiersToRemove),
        });
        return updated!;
      },

      syncDepartmentMembers: async (
        _: any,
        { departmentId }: { departmentId: string },
        context: GraphQLContext
      ) => {
        logger.info('Syncing department members from users.department field', { departmentId });
        
        const department = await Department.findById(departmentId);
        
        if (!department) {
          throw new AppError(`Department with ID ${departmentId} not found`, 404);
        }

        requireDepartmentUserManagement(context, department.name);

        // Find all HUMAN users in this department
        const deptUsers = await User.find({ 
          department: department.name, 
          ...ACTIVE_HUMAN_DEPARTMENT_MEMBER_FILTER,
        });

        // Rebuild member array using GitLab IDs when available, otherwise MongoDB IDs for manual users
        const memberIds = deptUsers
          .filter(isEligibleDepartmentMember)
          .map((user) => buildDepartmentMemberIdentifier(user));

        department.members = memberIds;
        await department.save();

        const updated = await Department.findById(departmentId).lean();
        logger.info('Department members synced successfully', { 
          departmentId, 
          departmentName: department.name,
          memberCount: memberIds.length 
        });
        return updated!;
      },

      syncAllDepartments: async (_: any, __: any, context: GraphQLContext) => {
        requirePlatformSuperAdmin(context);
        logger.info('Syncing all departments from users.department field');
        
        const allDepartments = await Department.find({ isActive: true });
        const results = [];

        for (const dept of allDepartments) {
          // Find all HUMAN users in this department
          const deptUsers = await User.find({ 
            department: dept.name, 
            ...ACTIVE_HUMAN_DEPARTMENT_MEMBER_FILTER,
          });

          // Rebuild member array
          const memberIds = deptUsers
            .filter(isEligibleDepartmentMember)
            .map((user) => buildDepartmentMemberIdentifier(user));

          dept.members = memberIds;
          await dept.save();

          results.push(dept);
          logger.info(`Synced ${dept.name}: ${memberIds.length} members`);
        }

        const updated = await Department.find({ isActive: true }).lean();
        logger.info('All departments synced successfully', { count: results.length });
        return updated;
      },

      linkDepartmentToNamespace: async (
        _: any,
        { departmentId, namespaceId }: { departmentId: string; namespaceId: string },
        context: GraphQLContext
      ) => {
        requirePlatformSuperAdmin(context);
        logger.info('Linking department to namespace', { departmentId, namespaceId });
        
        const department = await Department.findById(departmentId);
        
        if (!department) {
          throw new AppError(`Department with ID ${departmentId} not found`, 404);
        }

        // Validate namespace exists
        const namespace = await Namespace.findById(namespaceId);
        if (!namespace) {
          throw new AppError(`Namespace with ID ${namespaceId} not found`, 404);
        }

        department.namespaceId = namespaceId;
        await department.save();

        const updated = await Department.findById(departmentId).lean();
        logger.info('Department linked to namespace successfully', { 
          departmentId, 
          departmentName: department.name,
          namespaceId,
          namespaceName: namespace.name 
        });
        return updated!;
      },

      unlinkDepartmentFromNamespace: async (
        _: any,
        { departmentId }: { departmentId: string },
        context: GraphQLContext
      ) => {
        requirePlatformSuperAdmin(context);
        logger.info('Unlinking department from namespace', { departmentId });
        
        const department = await Department.findById(departmentId);
        
        if (!department) {
          throw new AppError(`Department with ID ${departmentId} not found`, 404);
        }

        department.namespaceId = undefined;
        await department.save();

        const updated = await Department.findById(departmentId).lean();
        logger.info('Department unlinked from namespace successfully', { departmentId });
        return updated!;
      },

      runDepartmentMigration: async (_: any, __: any, context: GraphQLContext) => {
        requirePlatformSuperAdmin(context);
        logger.info('Starting department data migration via GraphQL mutation');
        
        try {
          const result = await fixDepartmentData();
          
          return {
            success: result.success,
            message: 'Department migration completed successfully',
            departments: result.departments,
            humanUsers: result.humanUsers,
            nonHumanAccounts: result.nonHumanAccounts,
            details: result.details
          };
        } catch (error: any) {
          logger.error('Department migration failed', { error: error.message });
          throw new AppError(`Migration failed: ${error.message}`, 500);
        }
      },
    },
  },
});
