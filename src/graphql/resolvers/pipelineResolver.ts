import { Pipeline } from '../../models/Pipeline';
import { AppError } from '../../middleware';

export const pipelineQueries = {
  pipeline: async (_: any, { id }: { id: string }) => {
    const pipeline = await Pipeline.findById(id);
    if (!pipeline) {
      throw new AppError('Pipeline not found', 404);
    }
    return pipeline;
  },

  pipelines: async (_: any, { projectId, status, ref, limit = 20, offset = 0 }: any) => {
    const filter: any = { isDeleted: false };
    if (projectId) filter.projectId = projectId;
    if (status) filter.status = status;
    if (ref) filter.ref = ref;

    return await Pipeline.find(filter).limit(limit).skip(offset).sort({ createdAt: -1 });
  },
};

