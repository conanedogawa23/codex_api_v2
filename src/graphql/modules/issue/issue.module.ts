import { createModule, gql } from 'graphql-modules';
import { Issue } from '../../../models/Issue';
import { AppError } from '../../../middleware';
import { logger } from '../../../utils/logger';

export const issueModule = createModule({
  id: 'issue',
  typeDefs: gql`
    type Issue {
      id: ID!
      gitlabId: Int!
      iid: Int!
      projectId: Int!
      title: String!
      description: String
      state: IssueState!
      priority: IssuePriority!
      completionPercentage: Int!
      tags: [String!]!
      estimatedHours: Float
      actualHours: Float
      labels: [String!]!
      milestone: IssueMilestone
      assignees: [IssueAssignee!]!
      author: IssueAuthor!
      webUrl: String!
      createdAt: DateTime!
      updatedAt: DateTime!
      closedAt: DateTime
      dueDate: DateTime
      lastSynced: DateTime!
      isActive: Boolean!
    }

    type IssueMilestone {
      id: Int!
      title: String!
      description: String
      state: MilestoneState!
      dueDate: DateTime
    }

    type IssueAssignee {
      id: Int!
      name: String!
      username: String!
      email: String
      avatarUrl: String
    }

    type IssueAuthor {
      id: Int!
      name: String!
      username: String!
      email: String
      avatarUrl: String
    }

    enum IssueState {
      opened
      closed
    }

    enum IssuePriority {
      low
      medium
      high
      urgent
    }

    enum MilestoneState {
      active
      closed
    }

    input UpdateIssueInput {
      title: String
      description: String
      priority: IssuePriority
      estimatedHours: Float
      actualHours: Float
      dueDate: DateTime
    }

    extend type Query {
      issue(id: ID!): Issue
      issueByGitlabId(gitlabId: Int!): Issue
      issues(
        projectId: Int
        state: IssueState
        priority: IssuePriority
        assigneeId: Int
        labels: [String!]
        limit: Int = 20
        offset: Int = 0
      ): [Issue!]!
      issuesByProject(projectId: Int!, state: IssueState, limit: Int = 20): [Issue!]!
      overdueIssues(limit: Int = 20): [Issue!]!
    }

    extend type Mutation {
      updateIssue(id: ID!, input: UpdateIssueInput!): Issue!
      updateIssueProgress(id: ID!, percentage: Int!): Issue!
      addIssueTag(id: ID!, tag: String!): Issue!
      removeIssueTag(id: ID!, tag: String!): Issue!
      closeIssue(id: ID!): Issue!
      reopenIssue(id: ID!): Issue!
    }
  `,
  resolvers: {
    Query: {
      issue: async (_: any, { id }: { id: string }) => {
        const issue = await Issue.findById(id).lean();
        if (!issue) {
          throw new AppError('Issue not found', 404);
        }
        return issue;
      },

      issueByGitlabId: async (_: any, { gitlabId }: { gitlabId: number }) => {
        const issue = await Issue.findByGitlabId(gitlabId);
        if (!issue) {
          throw new AppError('Issue not found', 404);
        }
        return issue;
      },

      issues: async (
        _: any,
        { projectId, state, priority, assigneeId, labels, limit = 20, offset = 0 }: any
      ) => {
        const filter: any = {};
        if (projectId) filter.projectId = projectId;
        if (state) filter.state = state;
        if (priority) filter.priority = priority;
        if (assigneeId) filter['assignees.id'] = assigneeId;
        if (labels && labels.length > 0) filter.labels = { $in: labels };

        return await Issue.find(filter)
          .limit(limit)
          .skip(offset)
          .sort({ updatedAt: -1 })
          .lean();
      },

      issuesByProject: async (
        _: any,
        { projectId, state, limit = 20 }: { projectId: number; state?: string; limit: number }
      ) => {
        const filter: any = { projectId };
        if (state) filter.state = state;

        return await Issue.find(filter)
          .limit(limit)
          .sort({ updatedAt: -1 })
          .lean();
      },

      overdueIssues: async (_: any, { limit = 20 }: { limit: number }) => {
        const issues = await Issue.findOverdue();
        return issues.slice(0, limit);
      },
    },

    Mutation: {
      updateIssue: async (_: any, { id, input }: any) => {
        const issue = await Issue.findByIdAndUpdate(id, input, {
          new: true,
          runValidators: true,
        });
        if (!issue) {
          throw new AppError('Issue not found', 404);
        }
        logger.info(`Updated issue: ${issue.title}`);
        return issue;
      },

      updateIssueProgress: async (
        _: any,
        { id, percentage }: { id: string; percentage: number }
      ) => {
        if (percentage < 0 || percentage > 100) {
          throw new AppError('Percentage must be between 0 and 100', 400);
        }
        const issue = await Issue.findById(id);
        if (!issue) {
          throw new AppError('Issue not found', 404);
        }
        return await issue.updateProgress(percentage);
      },

      addIssueTag: async (_: any, { id, tag }: { id: string; tag: string }) => {
        const issue = await Issue.findById(id);
        if (!issue) {
          throw new AppError('Issue not found', 404);
        }
        return await issue.addTag(tag);
      },

      removeIssueTag: async (_: any, { id, tag }: { id: string; tag: string }) => {
        const issue = await Issue.findById(id);
        if (!issue) {
          throw new AppError('Issue not found', 404);
        }
        return await issue.removeTag(tag);
      },

      closeIssue: async (_: any, { id }: { id: string }) => {
        const issue = await Issue.findByIdAndUpdate(
          id,
          { state: 'closed', closedAt: new Date(), completionPercentage: 100 },
          { new: true, runValidators: true }
        );
        if (!issue) {
          throw new AppError('Issue not found', 404);
        }
        logger.info(`Closed issue: ${issue.title}`);
        return issue;
      },

      reopenIssue: async (_: any, { id }: { id: string }) => {
        const issue = await Issue.findByIdAndUpdate(
          id,
          { state: 'opened', closedAt: undefined },
          { new: true, runValidators: true }
        );
        if (!issue) {
          throw new AppError('Issue not found', 404);
        }
        logger.info(`Reopened issue: ${issue.title}`);
        return issue;
      },
    },
  },
});
