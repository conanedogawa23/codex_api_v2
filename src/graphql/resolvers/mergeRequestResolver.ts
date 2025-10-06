import { MergeRequest } from '../../models/MergeRequest';
import { AppError } from '../../middleware';

export const mergeRequestQueries = {
  mergeRequest: async (_: any, { id }: { id: string }) => {
    const mergeRequest = await MergeRequest.findById(id);
    if (!mergeRequest) {
      throw new AppError('Merge request not found', 404);
    }
    return mergeRequest;
  },

  mergeRequests: async (_: any, { projectId, state, authorId, limit = 20, offset = 0 }: any) => {
    const filter: any = { isActive: true };
    if (projectId) filter.projectId = projectId;
    if (state) filter.state = state;
    if (authorId) filter['author.id'] = authorId;

    return await MergeRequest.find(filter).limit(limit).skip(offset).sort({ updatedAt: -1 });
  },

  mergeRequestByGitlabId: async (_: any, { gitlabId }: { gitlabId: number }) => {
    const mergeRequest = await MergeRequest.findByGitlabId(gitlabId);
    if (!mergeRequest) {
      throw new AppError('Merge request not found', 404);
    }
    return mergeRequest;
  },
};

