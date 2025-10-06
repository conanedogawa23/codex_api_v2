import { Milestone } from '../../models/Milestone';
import { AppError } from '../../middleware';

export const milestoneQueries = {
  milestone: async (_: any, { id }: { id: string }) => {
    const milestone = await Milestone.findById(id);
    if (!milestone) {
      throw new AppError('Milestone not found', 404);
    }
    return milestone;
  },

  milestones: async (_: any, { projectId, state, limit = 20, offset = 0 }: any) => {
    const filter: any = { isDeleted: false };
    if (projectId) filter.projectId = projectId;
    if (state) filter.state = state;

    return await Milestone.find(filter).limit(limit).skip(offset).sort({ dueDate: 1 });
  },
};

