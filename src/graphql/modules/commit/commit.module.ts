import { createModule, gql } from 'graphql-modules';
import { Commit } from '../../../models/Commit';
import { Project } from '../../../models/Project';
import { Namespace } from '../../../models/Namespace';
import { User } from '../../../models/User';
import { AppError } from '../../../middleware';
import { logger } from '../../../utils/logger';
import { getAccessibleProjectIds } from '../../../utils/rbac';

const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeProjectEnumValue = (value?: string, fallback?: string): string =>
  (value || fallback || '').replace(/-/g, '_').toUpperCase();

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

    type ProjectsWithCommitActivityResult {
      projects: [ProjectCommitActivity!]!
      totalCount: Int!
    }

    extend type Query {
      commit(sha: String!): Commit
      commits(projectId: String!, limit: Int = 20, offset: Int = 0): [Commit!]!
      commitsByProject(projectId: String!, limit: Int = 20): [Commit!]!
      commitsByAuthor(authorEmail: String!, limit: Int = 20, offset: Int = 0): [Commit!]!
      projectsWithCommitActivity(
        username: String!
        days: Int = 30
        limit: Int = 20
        offset: Int = 0
        search: String
        namespace: String
        status: ProjectStatus
        priority: ProjectPriority
        recentOnly: Boolean = false
        userId: ID
        userRole: String
      ): ProjectsWithCommitActivityResult!
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

      projectsWithCommitActivity: async (
        _: any,
        {
          username,
          days = 30,
          limit = 20,
          offset = 0,
          search,
          namespace,
          status,
          priority,
          recentOnly = false,
          userId,
          userRole,
        }: {
          username: string;
          days: number;
          limit: number;
          offset: number;
          search?: string;
          namespace?: string;
          status?: string;
          priority?: string;
          recentOnly?: boolean;
          userId?: string;
          userRole?: string;
        }
      ) => {
        logger.info('Fetching projects with commit activity', {
          username,
          days,
          limit,
          offset,
          search,
          namespace,
          status,
          priority,
          recentOnly,
          userId,
          userRole,
        });
        
        try {
          // Find user by username to get their email
          const user = await User.findOne({ username }).select('email').lean();
          const authorEmail = user?.email || username;
          
          // Calculate date threshold from the days parameter
          const dateThreshold = new Date();
          dateThreshold.setDate(dateThreshold.getDate() - days);
          
          // Apply RBAC: determine which projects the caller can access
          const projectFilter: any = { isActive: true };

          if (userId && userRole) {
            const { isAdminUser, projectIds } = await getAccessibleProjectIds(userId, userRole);

            if (!isAdminUser) {
              if (projectIds.length === 0) {
                logger.info('Non-admin user has no accessible projects', { userId });
                return {
                  projects: [],
                  totalCount: 0,
                };
              }
              projectFilter._id = { $in: projectIds };
            }
          }

          // Run commit aggregation and project fetch in parallel
          const [commitActivity, allProjects] = await Promise.all([
            // Aggregate commits by project for this user within the date range
            Commit.aggregate([
              {
                $match: {
                  $or: [
                    { authorEmail },
                    { authorName: username }
                  ],
                  authoredDate: { $gte: dateThreshold },
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
            ]),
            // Get accessible active projects
            Project.find(projectFilter)
              .sort({ lastActivityAt: -1 })
              .lean()
          ]);
          
          // Create a map for quick lookup (Commit.projectId is a string matching project.gitlabId)
          const commitActivityMap = new Map(
            commitActivity.map((activity: any) => [
              activity._id.toString(),
              {
                commitCount: activity.commitCount,
                lastCommitDate: activity.lastCommitDate
              }
            ])
          );

          const searchRegex = search?.trim()
            ? new RegExp(escapeRegex(search.trim()), 'i')
            : null;

          let filteredProjects = allProjects.filter((project: any) => {
            if (status) {
              const normalizedStatus = normalizeProjectEnumValue(project.status, 'planned');
              if (normalizedStatus !== status) {
                return false;
              }
            }

            if (priority) {
              const normalizedPriority = normalizeProjectEnumValue(project.priority, 'medium');
              if (normalizedPriority !== priority) {
                return false;
              }
            }

            if (searchRegex) {
              const matchesSearch =
                searchRegex.test(project.name || '') ||
                searchRegex.test(project.description || '');

              if (!matchesSearch) {
                return false;
              }
            }

            if (recentOnly) {
              const projectIdStr = project.gitlabId?.toString() || '';
              const activity = commitActivityMap.get(projectIdStr);

              if ((activity?.commitCount || 0) === 0) {
                return false;
              }
            }

            return true;
          });
          
          // Batch-fetch all namespaces in a single query to avoid N+1 per-project lookups
          const namespaceIds = [...new Set(
            filteredProjects
              .map((p: any) => p.namespace?.id)
              .filter((id: any) => id != null)
          )];
          
          const namespaces = namespaceIds.length > 0
            ? await Namespace.find({ gitlabId: { $in: namespaceIds } }).lean()
            : [];
          
          const namespaceMap = new Map(
            namespaces.map((ns: any) => [ns.gitlabId, ns])
          );

          // Helper to build resolved namespace object
          const resolveNamespace = (project: any) => {
            const nsId = project.namespace?.id;
            if (!nsId) {
              return { id: 0, name: 'Unknown', path: 'unknown', kind: 'group', fullPath: 'unknown', membersCountWithDescendants: 0, billableMembersCount: 0 };
            }
            const ns = namespaceMap.get(nsId);
            if (ns) {
              return { id: ns.gitlabId, name: ns.name, path: ns.path, kind: ns.kind, fullPath: ns.fullPath, membersCountWithDescendants: ns.membersCountWithDescendants || 0, billableMembersCount: ns.billableMembersCount || 0 };
            }
            return { ...project.namespace, fullPath: project.namespace.path, membersCountWithDescendants: 0, billableMembersCount: 0 };
          };
          
          // Build results: attach batch-resolved namespace to skip per-project DB lookups
          let results = filteredProjects.map((project: any) => {
            const projectIdStr = project.gitlabId?.toString() || '';
            const activity = commitActivityMap.get(projectIdStr);
            
            return {
              project: {
                ...project,
                _namespaceBatchResolved: resolveNamespace(project)
              },
              commitCount: activity?.commitCount || 0,
              lastCommitDate: activity?.lastCommitDate || null
            };
          });

          if (namespace?.trim()) {
            const namespaceRegex = new RegExp(`^${escapeRegex(namespace.trim())}$`, 'i');
            results = results.filter((result: any) =>
              namespaceRegex.test(result.project._namespaceBatchResolved?.name || '')
            );
          }
          
          // Sort by commit count descending, then by last commit date
          results.sort((a, b) => {
            if (a.commitCount !== b.commitCount) {
              return b.commitCount - a.commitCount;
            }
            if (a.lastCommitDate && b.lastCommitDate) {
              return new Date(b.lastCommitDate).getTime() - new Date(a.lastCommitDate).getTime();
            }
            if (a.lastCommitDate) return -1;
            if (b.lastCommitDate) return 1;
            return 0;
          });

          const totalCount = results.length;
          const paginatedResults = results.slice(offset, offset + limit);
          
          logger.info('Fetched projects with commit activity', { 
            username, 
            days,
            totalProjects: totalCount,
            projectsWithCommits: results.filter(r => r.commitCount > 0).length,
            returnedProjects: paginatedResults.length,
          });
          
          return {
            projects: paginatedResults,
            totalCount,
          };
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
