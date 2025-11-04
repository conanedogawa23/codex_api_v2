import { createModule, gql } from 'graphql-modules';
import { User } from '../../../models/User';
import { AppError } from '../../../middleware';

export const userModule = createModule({
  id: 'user',
  typeDefs: gql`
    type User {
      id: ID!
      gitlabId: Int
      name: String!
      email: String!
      username: String!
      role: String!
      department: String!
      avatar: String
      joinDate: DateTime!
      status: UserStatus!
      skills: [String!]!
      assignedRepos: [String!]!
      projects: [UserProject!]!
      lastSynced: DateTime!
      isActive: Boolean!
      createdAt: DateTime!
      updatedAt: DateTime!
    }

    """
    OrganizationUser is an alias for User type for frontend compatibility
    """
    type OrganizationUser {
      id: ID!
      gitlabId: Int
      name: String!
      email: String!
      username: String!
      role: String!
      department: String!
      avatar: String
      joinDate: DateTime!
      status: UserStatus!
      skills: [String!]!
      assignedRepos: [String!]!
      projects: [UserProject!]!
      lastSynced: DateTime!
      isActive: Boolean!
      createdAt: DateTime!
      updatedAt: DateTime!
    }

    enum UserStatus {
      ACTIVE
      INACTIVE
      ON_LEAVE
    }

    type UserProject {
      id: String!
      name: String!
      role: String!
    }

    input UpdateUserInput {
      role: String
      department: String
      status: UserStatus
      skills: [String!]
    }

    extend type Query {
      user(id: ID!): User
      users(
        status: UserStatus
        department: String
        limit: Int = 20
        offset: Int = 0
      ): [User!]!
      organizationUsers: [OrganizationUser!]!
      userByEmail(email: String!): User
      userByGitlabId(gitlabId: Int!): User
    }

    extend type Mutation {
      updateUser(id: ID!, input: UpdateUserInput!): User
      addUserProject(id: ID!, projectId: String!, projectName: String!, role: String!): User
      removeUserProject(id: ID!, projectId: String!): User
    }
  `,
  resolvers: {
    User: {
      id: (parent: any) => parent._id?.toString() || parent.id,
      status: (parent: any) => {
        // Convert DB format (lowercase with hyphen) to GraphQL format (uppercase with underscore)
        // DB: 'on-leave' -> GraphQL: 'ON_LEAVE'
        return parent.status?.replace(/-/g, '_').toUpperCase();
      },
      createdAt: (parent: any) => parent.createdAt || parent.joinDate || new Date(),
      updatedAt: (parent: any) => parent.updatedAt || parent.lastSynced || parent.createdAt || new Date(),
    },
    
    OrganizationUser: {
      id: (parent: any) => parent._id?.toString() || parent.id,
      status: (parent: any) => {
        return parent.status?.replace(/-/g, '_').toUpperCase();
      },
      createdAt: (parent: any) => parent.createdAt || parent.joinDate || new Date(),
      updatedAt: (parent: any) => parent.updatedAt || parent.lastSynced || parent.createdAt || new Date(),
    },
    
    Query: {
      user: async (_: any, { id }: { id: string }) => {
        const user = await User.findById(id).lean();
        if (!user) {
          throw new AppError('User not found', 404);
        }
        return user;
      },
      users: async (_: any, { status, department, limit = 20, offset = 0 }: any) => {
        const filter: any = {};
        // Convert GraphQL enum to DB format
        if (status) filter.status = status.toLowerCase().replace(/_/g, '-');
        if (department) filter.department = department;
        return await User.find(filter).limit(limit).skip(offset).sort({ createdAt: -1 }).lean();
      },
      userByEmail: async (_: any, { email }: { email: string }) => {
        const user = await User.findByEmail(email);
        if (!user) {
          throw new AppError('User not found', 404);
        }
        return user;
      },
      organizationUsers: async () => {
        return await User.find({ isActive: true }).sort({ name: 1 }).lean();
      },
      userByGitlabId: async (_: any, { gitlabId }: { gitlabId: number }) => {
        const user = await User.findByGitlabId(gitlabId);
        if (!user) {
          throw new AppError('User not found', 404);
        }
        return user;
      },
    },
    Mutation: {
      updateUser: async (_: any, { id, input }: any) => {
        // Convert GraphQL enum to DB format
        const dbInput = { ...input };
        if (dbInput.status) dbInput.status = dbInput.status.toLowerCase().replace(/_/g, '-');
        
        const user = await User.findByIdAndUpdate(id, dbInput, { new: true, runValidators: true });
        if (!user) {
          throw new AppError('User not found', 404);
        }
        return user;
      },
      addUserProject: async (_: any, { id, projectId, projectName, role }: any) => {
        const user = await User.findById(id);
        if (!user) {
          throw new AppError('User not found', 404);
        }
        await user.addProject(projectId, projectName, role);
        return await User.findById(id).lean(); // Return updated user as lean object
      },
      removeUserProject: async (_: any, { id, projectId }: any) => {
        const user = await User.findById(id);
        if (!user) {
          throw new AppError('User not found', 404);
        }
        await user.removeProject(projectId);
        return await User.findById(id).lean(); // Return updated user as lean object
      },
    },
  },
});
