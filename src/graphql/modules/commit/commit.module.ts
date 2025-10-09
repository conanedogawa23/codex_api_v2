import { createModule, gql } from 'graphql-modules';
import { Commit } from '../../../models/Commit';
import { AppError } from '../../../middleware';
import { logger } from '../../../utils/logger';

export const commitModule = createModule({
  id: 'commit',
  typeDefs: gql`
    type Commit {
      id: ID!
      sha: String!
      projectId: String!
      shortId: String!
      title: String!
      message: String!
      authorName: String!
      authorEmail: String!
      authoredDate: DateTime!
      committerName: String!
      committerEmail: String!
      committedDate: DateTime!
      webUrl: String!
      parentIds: [String!]!
      stats: CommitStats
      userId: ID
      lastSyncedAt: DateTime!
      isDeleted: Boolean!
      createdAt: DateTime!
    }

    type CommitStats {
      additions: Int!
      deletions: Int!
      total: Int!
    }

    extend type Query {
      commit(sha: String!): Commit
      commits(projectId: String!, limit: Int = 20, offset: Int = 0): [Commit!]!
      commitsByProject(projectId: String!, limit: Int = 20): [Commit!]!
      commitsByAuthor(authorEmail: String!, limit: Int = 20, offset: Int = 0): [Commit!]!
    }
  `,
  resolvers: {
    Query: {
      commit: async (_: any, { sha }: { sha: string }) => {
        logger.info('Fetching commit by SHA', { sha });
        
        const commit = await Commit.findOne({ sha, isDeleted: false }).lean();
        
        if (!commit) {
          throw new AppError(`Commit with SHA ${sha} not found`, 404);
        }
        
        return commit;
      },

      commits: async (_: any, { projectId, limit, offset }: { projectId: string; limit: number; offset: number }) => {
        logger.info('Fetching commits', { projectId, limit, offset });
        
        return await Commit.find({ projectId, isDeleted: false })
          .limit(limit)
          .skip(offset)
          .sort({ authoredDate: -1 })
          .lean();
      },

      commitsByProject: async (_: any, { projectId, limit }: { projectId: string; limit: number }) => {
        logger.info('Fetching commits by project', { projectId, limit });
        
        return await Commit.find({ projectId, isDeleted: false })
          .limit(limit)
          .sort({ authoredDate: -1 })
          .lean();
      },

      commitsByAuthor: async (_: any, { authorEmail, limit, offset }: { authorEmail: string; limit: number; offset: number }) => {
        logger.info('Fetching commits by author', { authorEmail, limit, offset });
        
        return await Commit.find({ authorEmail, isDeleted: false })
          .limit(limit)
          .skip(offset)
          .sort({ authoredDate: -1 })
          .lean();
      },
    },
  },
});
