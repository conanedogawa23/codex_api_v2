import { createModule, gql } from 'graphql-modules';
import { Department } from '../../../models/Department';
import { AppError } from '../../../middleware';
import { logger } from '../../../utils/logger';

export const departmentModule = createModule({
  id: 'department',
  typeDefs: gql`
    type Department {
      id: ID!
      gitlabId: Int
      name: String!
      description: String
      head: DepartmentHead
      members: [String!]!
      projects: [String!]!
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

    extend type Mutation {
      addMemberToDepartment(departmentId: ID!, userId: String!): Department!
      removeMemberFromDepartment(departmentId: ID!, userId: String!): Department!
      addProjectToDepartment(departmentId: ID!, projectId: String!): Department!
      removeProjectFromDepartment(departmentId: ID!, projectId: String!): Department!
    }
  `,
  resolvers: {
    Department: {
      id: (parent: any) => parent._id?.toString() || parent.id,
      memberCount: (parent: any) => parent.members?.length || 0,
      projectCount: (parent: any) => parent.projects?.length || 0,
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

        await department.addMember(userId);
        
        const updated = await Department.findById(departmentId).lean();
        logger.info('Member added to department successfully', { departmentId, userId });
        return updated!;
      },

      removeMemberFromDepartment: async (_: any, { departmentId, userId }: { departmentId: string; userId: string }) => {
        logger.info('Removing member from department', { departmentId, userId });
        
        const department = await Department.findById(departmentId);
        
        if (!department) {
          throw new AppError(`Department with ID ${departmentId} not found`, 404);
        }

        await department.removeMember(userId);
        
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
    },
  },
});
