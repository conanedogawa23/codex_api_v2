import { createModule, gql } from 'graphql-modules';
import mongoose from 'mongoose';

/**
 * Phase 0 plugin decision: hybrid of (a) service auth + (b) scoped unauthenticated access.
 * — Browser users: JWT cookie; `requireUserOrPluginService` passes via currentUser.
 * — VS Code plugin: `X-Codex-Plugin-Token` must match `PLUGIN_GRAPHQL_SERVICE_TOKEN`;
 *   `aiContext` then requires `projectId` (no global search) and caps `limit` (max 10).
 */
import { AppError } from '../../../middleware';
import { GraphQLContext, requireUserOrPluginService } from '../../../utils/auth';
import { Issue } from '../../../models/Issue';
import { MergeRequest } from '../../../models/MergeRequest';
import { Pipeline } from '../../../models/Pipeline';
import { Project } from '../../../models/Project';
import { logger } from '../../../utils/logger';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const aiContextModule = createModule({
  id: 'aiContext',
  typeDefs: gql`
    type AIContextProject {
      id: ID!
      gitlabId: Int
      name: String!
      status: String
      description: String
    }

    type AIContextIssue {
      id: ID!
      title: String!
      state: String!
      description: String
      labels: [String!]!
    }

    type AIContextMergeRequest {
      id: ID!
      title: String!
      state: String!
      sourceBranch: String!
      targetBranch: String!
    }

    type AIContextPipeline {
      id: ID!
      status: String!
      ref: String!
      sha: String!
    }

    type AIContextResult {
      summary: String!
      project: AIContextProject
      issues: [AIContextIssue!]!
      mergeRequests: [AIContextMergeRequest!]!
      pipelines: [AIContextPipeline!]!
    }

    extend type Query {
      aiContext(projectId: ID, query: String!, limit: Int = 5): AIContextResult!
    }
  `,
  resolvers: {
    Query: {
      aiContext: async (
        _: unknown,
        args: { limit?: number; projectId?: string; query: string },
        context: GraphQLContext
      ) => {
        requireUserOrPluginService(context);
        if (context.pluginServiceAuthenticated && !args.projectId?.trim()) {
          throw new AppError('projectId is required', 400);
        }

        const limit = Math.min(Math.max(args.limit || 5, 1), 10);
        const normalizedQuery = args.query.trim();
        if (!normalizedQuery) {
          throw new AppError('Query is required', 400);
        }

        try {
          const regex = new RegExp(escapeRegex(normalizedQuery), 'i');

          let project: any = null;
          if (args.projectId) {
            if (mongoose.Types.ObjectId.isValid(args.projectId)) {
              project = await Project.findById(args.projectId)
                .select('_id gitlabId name description status')
                .lean();
            } else if (!Number.isNaN(Number(args.projectId))) {
              project = await Project.findOne({ gitlabId: Number(args.projectId) })
                .select('_id gitlabId name description status')
                .lean();
            }

            if (!project) {
              throw new AppError('Project not found', 404);
            }
          } else {
            project = await Project.findOne({
              $or: [{ name: regex }, { nameWithNamespace: regex }, { description: regex }],
            })
              .select('_id gitlabId name description status')
              .lean();
          }

          const issueFilter: Record<string, unknown> = {
            $or: [{ title: regex }, { description: regex }, { labels: regex }],
          };
          const mergeRequestFilter: Record<string, unknown> = {
            $or: [{ title: regex }, { description: regex }, { sourceBranch: regex }, { targetBranch: regex }],
          };
          const pipelineFilter: Record<string, unknown> = {
            $or: [{ ref: regex }, { sha: regex }, { status: regex }, { source: regex }],
          };

          if (project?.gitlabId) {
            issueFilter.projectId = project.gitlabId;
            mergeRequestFilter.projectId = project.gitlabId;
          }
          if (project?._id) {
            pipelineFilter.projectId = project._id.toString();
          }

          const [issues, mergeRequests, pipelines] = await Promise.all([
            Issue.find(issueFilter)
              .select('_id title state description labels')
              .sort({ updatedAt: -1 })
              .limit(limit)
              .lean(),
            MergeRequest.find(mergeRequestFilter)
              .select('_id title state sourceBranch targetBranch')
              .sort({ updatedAt: -1 })
              .limit(limit)
              .lean(),
            Pipeline.find(pipelineFilter)
              .select('_id status ref sha')
              .sort({ createdAt: -1 })
              .limit(limit)
              .lean(),
          ]);

          logger.info('Resolved aiContext query', {
            issueCount: issues.length,
            mergeRequestCount: mergeRequests.length,
            pipelineCount: pipelines.length,
            projectId: args.projectId,
            query: normalizedQuery,
            actorUserId: context.currentUser?.userId ?? null,
            pluginService: context.pluginServiceAuthenticated,
          });

          return {
            summary: `Project context for "${normalizedQuery}" with ${issues.length} matching issues, ${mergeRequests.length} merge requests, and ${pipelines.length} pipelines.`,
            project: project
              ? {
                  id: project._id.toString(),
                  gitlabId: project.gitlabId,
                  name: project.name,
                  status: project.status,
                  description: project.description,
                }
              : null,
            issues: issues.map((issue: any) => ({
              id: issue._id.toString(),
              title: issue.title,
              state: issue.state,
              description: issue.description,
              labels: issue.labels || [],
            })),
            mergeRequests: mergeRequests.map((mergeRequest: any) => ({
              id: mergeRequest._id.toString(),
              title: mergeRequest.title,
              state: mergeRequest.state,
              sourceBranch: mergeRequest.sourceBranch,
              targetBranch: mergeRequest.targetBranch,
            })),
            pipelines: pipelines.map((pipeline: any) => ({
              id: pipeline._id.toString(),
              status: pipeline.status,
              ref: pipeline.ref,
              sha: pipeline.sha,
            })),
          };
        } catch (error) {
          logger.error('Failed to resolve aiContext query', {
            error: error instanceof Error ? error.message : 'Unknown error',
            projectId: args.projectId,
            query: normalizedQuery,
          });
          throw error;
        }
      },
    },
  },
});
