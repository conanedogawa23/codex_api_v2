import { createModule, gql } from 'graphql-modules';
import { Commit } from '../../../models/Commit';
import { Project } from '../../../models/Project';
import { User } from '../../../models/User';
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

    type ProjectCommitActivity {
      project: Project!
      commitCount: Int!
      lastCommitDate: DateTime
    }

    extend type Query {
      commit(sha: String!): Commit
      commits(projectId: String!, limit: Int = 20, offset: Int = 0): [Commit!]!
      commitsByProject(projectId: String!, limit: Int = 20): [Commit!]!
      commitsByAuthor(authorEmail: String!, limit: Int = 20, offset: Int = 0): [Commit!]!
      projectsWithCommitActivity(username: String!, days: Int = 30): [ProjectCommitActivity!]!
    }
  `,
  resolvers: {
    Commit: {
      id: (parent: any) => parent._id?.toString() || parent.id,
    },
    
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

      projectsWithCommitActivity: async (_: any, { username, days = 30 }: { username: string; days: number }) => {
        logger.info('Fetching all projects with commit activity', { username, days });
        
        try {
          // Find user by username to get their email
          const user = await User.findOne({ username }).lean();
          const authorEmail = user?.email || username;
          
          // Calculate date range (optional - can be used for filtering commits)
          const cutoffDate = new Date();
          cutoffDate.setDate(cutoffDate.getDate() - days);
          
          // Get ALL active projects
          const allProjects = await Project.find({ isActive: true })
            .sort({ lastActivityAt: -1 })
            .lean();
          
          // Aggregate commits by project for this user (no date filter to get all commits)
          const commitActivity = await Commit.aggregate([
            {
              $match: {
                $or: [
                  { authorEmail },
                  { authorName: username }
                ],
                isDeleted: false
              }
            },
            {
              $group: {
                _id: '$projectId',
                commitCount: { $sum: 1 },
                lastCommitDate: { $max: '$authoredDate' }
              }
            }
          ]);
          
          // Create a map for quick lookup
          const commitActivityMap = new Map(
            commitActivity.map((activity: any) => [
              activity._id.toString(),
              {
                commitCount: activity.commitCount,
                lastCommitDate: activity.lastCommitDate
              }
            ])
          );
          
          // Build results for all projects
          const results = allProjects.map((project: any) => {
            const projectIdStr = project.gitlabId?.toString() || '';
            const activity = commitActivityMap.get(projectIdStr);
            
            return {
              project,
              commitCount: activity?.commitCount || 0,
              lastCommitDate: activity?.lastCommitDate || null
            };
          });
          
          // Sort by commit count (projects with commits first)
          results.sort((a, b) => {
            if (a.commitCount !== b.commitCount) {
              return b.commitCount - a.commitCount;
            }
            // If same commit count, sort by last commit date
            if (a.lastCommitDate && b.lastCommitDate) {
              return new Date(b.lastCommitDate).getTime() - new Date(a.lastCommitDate).getTime();
            }
            if (a.lastCommitDate) return -1;
            if (b.lastCommitDate) return 1;
            return 0;
          });
          
          logger.info('Fetched all projects with commit activity', { 
            username, 
            totalProjects: results.length,
            projectsWithCommits: results.filter(r => r.commitCount > 0).length
          });
          
          return results;
        } catch (error) {
          logger.error('Error fetching projects with commit activity', { 
            username, 
            days, 
            error 
          });
          throw new AppError('Failed to fetch projects with commit activity', 500);
        }
      },
    },
  },
});
