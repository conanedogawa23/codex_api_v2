import { createModule, gql } from 'graphql-modules';
import { Department } from '../../../models/Department';
import { User } from '../../../models/User';
import { Project } from '../../../models/Project';
import { Namespace } from '../../../models/Namespace';
import { AppError } from '../../../middleware';
import { logger } from '../../../utils/logger';
import { fixDepartmentData } from '../../../utils/migrations/fixDepartmentData';

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

    extend type Mutation {
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
      members: async (parent: any) => {
        if (!parent.members || parent.members.length === 0) {
          return [];
        }
        
        // Convert string IDs to numbers for gitlabId query
        const gitlabIds = parent.members.map((id: string) => parseInt(id)).filter((id: number) => !isNaN(id));
        
        if (gitlabIds.length === 0) {
          return [];
        }
        
        const users = await User.find({ 
          gitlabId: { $in: gitlabIds },
          userType: 'human',
          isActive: true 
        }).lean();
        
        return users;
      },
      
      // Resolve projects as Project objects
      projects: async (parent: any) => {
        if (!parent.projects || parent.projects.length === 0) {
          return [];
        }
        
        // Convert string IDs to numbers for gitlabId query
        const gitlabIds = parent.projects.map((id: string) => parseInt(id)).filter((id: number) => !isNaN(id));
        
        if (gitlabIds.length === 0) {
          return [];
        }
        
        const projects = await Project.find({ 
          gitlabId: { $in: gitlabIds },
          isActive: true 
        }).lean();
        
        return projects;
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
      department: async (_: any, { id }: { id: string }) => {
        logger.info('Fetching department by ID', { id });
        
        const department = await Department.findById(id).lean();
        
        if (!department) {
          throw new AppError(`Department with ID ${id} not found`, 404);
        }
        
        return department;
      },

      departmentByName: async (_: any, { name }: { name: string }) => {
        logger.info('Fetching department by name', { name });
        
        const department = await Department.findOne({ name }).lean();
        
        if (!department) {
          throw new AppError(`Department with name ${name} not found`, 404);
        }
        
        return department;
      },

      departments: async (_: any, { isActive, limit, offset }: { isActive?: boolean; limit: number; offset: number }) => {
        logger.info('Fetching departments', { isActive, limit, offset });
        
        const filter: any = {};
        if (isActive !== undefined) filter.isActive = isActive;
        
        return await Department.find(filter)
          .limit(limit)
          .skip(offset)
          .sort({ name: 1 })
          .lean();
      },

      activeDepartments: async () => {
        logger.info('Fetching active departments');
        
        return await Department.find({ isActive: true })
          .sort({ name: 1 })
          .lean();
      },
    },

    Mutation: {
      addMemberToDepartment: async (_: any, { departmentId, userId }: { departmentId: string; userId: string }) => {
        logger.info('Adding member to department', { departmentId, userId });
        
        const department = await Department.findById(departmentId);
        
        if (!department) {
          throw new AppError(`Department with ID ${departmentId} not found`, 404);
        }

        // Find user by gitlabId (userId is gitlabId as string)
        const user = await User.findOne({ gitlabId: parseInt(userId) });
        
        if (!user) {
          throw new AppError(`User with GitLab ID ${userId} not found`, 404);
        }

        // Validate user is human
        if (user.userType !== 'human') {
          throw new AppError(`Cannot add non-human account (${user.userType}) to department`, 400);
        }

        // Add to department members array
        await department.addMember(userId);
        
        // SYNC: Update user's department field
        user.department = department.name;
        await user.save();
        
        const updated = await Department.findById(departmentId).lean();
        logger.info('Member added to department and user.department synced', { departmentId, userId, departmentName: department.name });
        return updated!;
      },

      removeMemberFromDepartment: async (_: any, { departmentId, userId }: { departmentId: string; userId: string }) => {
        logger.info('Removing member from department', { departmentId, userId });
        
        const department = await Department.findById(departmentId);
        
        if (!department) {
          throw new AppError(`Department with ID ${departmentId} not found`, 404);
        }

        // Remove from department members array
        await department.removeMember(userId);
        
        // SYNC: Update user's department field to empty or default
        const user = await User.findOne({ gitlabId: parseInt(userId) });
        if (user) {
          user.department = 'General'; // Move to General department instead of leaving empty
          await user.save();
          logger.info('User moved to General department', { userId });
        }
        
        const updated = await Department.findById(departmentId).lean();
        logger.info('Member removed from department successfully', { departmentId, userId });
        return updated!;
      },

      addProjectToDepartment: async (_: any, { departmentId, projectId }: { departmentId: string; projectId: string }) => {
        logger.info('Adding project to department', { departmentId, projectId });
        
        const department = await Department.findById(departmentId);
        
        if (!department) {
          throw new AppError(`Department with ID ${departmentId} not found`, 404);
        }

        await department.addProject(projectId);
        
        const updated = await Department.findById(departmentId).lean();
        logger.info('Project added to department successfully', { departmentId, projectId });
        return updated!;
      },

      removeProjectFromDepartment: async (_: any, { departmentId, projectId }: { departmentId: string; projectId: string }) => {
        logger.info('Removing project from department', { departmentId, projectId });
        
        const department = await Department.findById(departmentId);
        
        if (!department) {
          throw new AppError(`Department with ID ${departmentId} not found`, 404);
        }

        await department.removeProject(projectId);
        
        const updated = await Department.findById(departmentId).lean();
        logger.info('Project removed from department successfully', { departmentId, projectId });
        return updated!;
      },

      syncDepartmentMembers: async (_: any, { departmentId }: { departmentId: string }) => {
        logger.info('Syncing department members from users.department field', { departmentId });
        
        const department = await Department.findById(departmentId);
        
        if (!department) {
          throw new AppError(`Department with ID ${departmentId} not found`, 404);
        }

        // Find all HUMAN users in this department
        const deptUsers = await User.find({ 
          department: department.name, 
          userType: 'human',
          isActive: true 
        });

        // Rebuild member array using gitlabId as string
        const memberIds = deptUsers
          .filter(user => user.gitlabId)
          .map(user => user.gitlabId!.toString());

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

      syncAllDepartments: async () => {
        logger.info('Syncing all departments from users.department field');
        
        const allDepartments = await Department.find({ isActive: true });
        const results = [];

        for (const dept of allDepartments) {
          // Find all HUMAN users in this department
          const deptUsers = await User.find({ 
            department: dept.name, 
            userType: 'human',
            isActive: true 
          });

          // Rebuild member array
          const memberIds = deptUsers
            .filter(user => user.gitlabId)
            .map(user => user.gitlabId!.toString());

          dept.members = memberIds;
          await dept.save();

          results.push(dept);
          logger.info(`Synced ${dept.name}: ${memberIds.length} members`);
        }

        const updated = await Department.find({ isActive: true }).lean();
        logger.info('All departments synced successfully', { count: results.length });
        return updated;
      },

      linkDepartmentToNamespace: async (_: any, { departmentId, namespaceId }: { departmentId: string; namespaceId: string }) => {
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

      unlinkDepartmentFromNamespace: async (_: any, { departmentId }: { departmentId: string }) => {
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

      runDepartmentMigration: async () => {
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
