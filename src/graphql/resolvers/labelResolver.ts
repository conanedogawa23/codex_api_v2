import { Label } from '../../models/Label';
import { AppError } from '../../middleware';

export const labelQueries = {
  label: async (_: any, { id }: { id: string }) => {
    const label = await Label.findById(id);
    if (!label) {
      throw new AppError('Label not found', 404);
    }
    return label;
  },

  labels: async (_: any, { projectId, limit = 20, offset = 0 }: any) => {
    const filter: any = { isDeleted: false };
    if (projectId) filter.projectId = projectId;

    return await Label.find(filter).limit(limit).skip(offset).sort({ name: 1 });
  },
};

