import { createModule, gql } from 'graphql-modules';
import { Namespace } from '../../../models/Namespace';
import { AppError } from '../../../middleware';
import { logger } from '../../../utils/logger';

export const namespaceModule = createModule({
  id: 'namespace',
  typeDefs: gql`
    type Namespace {
      id: ID!
      gitlabId: Int!
      name: String!
      path: String!
      kind: NamespaceKind!
      fullName: String!
      fullPath: String!
      parentId: Int
      avatarUrl: String
      webUrl: String!
      membersCountWithDescendants: Int
      billableMembersCount: Int
      maxSeatsUsed: Int
      seatsInUse: Int
      planName: String
      trialEndsOn: DateTime
      trial: Boolean!
      createdAt: DateTime!
      updatedAt: DateTime!
      lastSyncedAt: DateTime!
      isDeleted: Boolean!
    }

    enum NamespaceKind {
      user
      group
    }

    extend type Query {
      namespace(id: ID!): Namespace
      namespaceByGitlabId(gitlabId: Int!): Namespace
      namespaceByPath(path: String!): Namespace
      namespaces(kind: NamespaceKind, limit: Int = 20, offset: Int = 0): [Namespace!]!
      namespacesByParent(parentId: Int!, limit: Int = 20): [Namespace!]!
    }
  `,
  resolvers: {
    Query: {
      namespace: async (_: any, { id }: { id: string }) => {
        logger.info('Fetching namespace by ID', { id });
        
        const namespace = await Namespace.findById(id).lean();
        
        if (!namespace) {
          throw new AppError(`Namespace with ID ${id} not found`, 404);
        }
        
        return namespace;
      },

      namespaceByGitlabId: async (_: any, { gitlabId }: { gitlabId: number }) => {
        logger.info('Fetching namespace by GitLab ID', { gitlabId });
        
        const namespace = await Namespace.findOne({ gitlabId, isDeleted: false }).lean();
        
        if (!namespace) {
          throw new AppError(
            `Namespace with GitLab ID ${gitlabId} not found. It may not be synced yet.`,
            404
          );
        }
        
        return namespace;
      },

      namespaceByPath: async (_: any, { path }: { path: string }) => {
        logger.info('Fetching namespace by path', { path });
        
        const namespace = await Namespace.findOne({ 
          $or: [{ path }, { fullPath: path }],
          isDeleted: false 
        }).lean();
        
        if (!namespace) {
          throw new AppError(`Namespace with path ${path} not found`, 404);
        }
        
        return namespace;
      },

      namespaces: async (_: any, { kind, limit, offset }: { kind?: string; limit: number; offset: number }) => {
        logger.info('Fetching namespaces', { kind, limit, offset });
        
        const filter: any = { isDeleted: false };
        if (kind) filter.kind = kind;
        
        return await Namespace.find(filter)
          .limit(limit)
          .skip(offset)
          .sort({ name: 1 })
          .lean();
      },

      namespacesByParent: async (_: any, { parentId, limit }: { parentId: number; limit: number }) => {
        logger.info('Fetching namespaces by parent', { parentId, limit });
        
        return await Namespace.find({ parentId, isDeleted: false })
          .limit(limit)
          .sort({ name: 1 })
          .lean();
      },
    },
  },
});
