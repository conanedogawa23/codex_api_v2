import { Issue } from '../../models/Issue';
import { AppError } from '../../middleware';

export const issueQueries = {
  issue: async (_: any, { id }: { id: string }) => {
    const issue = await Issue.findById(id);
    if (!issue) {
      throw new AppError('Issue not found', 404);
    }
    return issue;
  },

  issues: async (_: any, { projectId, state, priority, assigneeId, limit = 20, offset = 0 }: any) => {
    const filter: any = { isActive: true };
    if (projectId) filter.projectId = projectId;
    if (state) filter.state = state;
    if (priority) filter.priority = priority;
    if (assigneeId) filter['assignees.id'] = assigneeId;

    return await Issue.find(filter).limit(limit).skip(offset).sort({ updatedAt: -1 });
  },

  issueByGitlabId: async (_: any, { gitlabId }: { gitlabId: number }) => {
    const issue = await Issue.findByGitlabId(gitlabId);
    if (!issue) {
      throw new AppError('Issue not found', 404);
    }
    return issue;
  },

  overdueIssues: async () => {
    return await Issue.findOverdue();
  },
};

export const issueMutations = {
  updateIssue: async (_: any, { id, input }: any) => {
    const issue = await Issue.findByIdAndUpdate(id, input, { new: true, runValidators: true });
    if (!issue) {
      throw new AppError('Issue not found', 404);
    }
    return issue;
  },

  updateIssueProgress: async (_: any, { id, percentage }: any) => {
    const issue = await Issue.findById(id);
    if (!issue) {
      throw new AppError('Issue not found', 404);
    }
    return await issue.updateProgress(percentage);
  },

  addIssueTag: async (_: any, { id, tag }: any) => {
    const issue = await Issue.findById(id);
    if (!issue) {
      throw new AppError('Issue not found', 404);
    }
    return await issue.addTag(tag);
  },

  removeIssueTag: async (_: any, { id, tag }: any) => {
    const issue = await Issue.findById(id);
    if (!issue) {
      throw new AppError('Issue not found', 404);
    }
    return await issue.removeTag(tag);
  },
};

