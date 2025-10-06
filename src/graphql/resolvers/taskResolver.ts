import { Task } from '../../models/Task';
import { AppError } from '../../middleware';

export const taskQueries = {
  task: async (_: any, { id }: { id: string }) => {
    const task = await Task.findById(id);
    if (!task) {
      throw new AppError('Task not found', 404);
    }
    return task;
  },

  tasks: async (_: any, { projectId, status, priority, assignedToId, limit = 20, offset = 0 }: any) => {
    const filter: any = { isActive: true };
    if (projectId) filter.projectId = projectId;
    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    if (assignedToId) filter['assignedTo.id'] = assignedToId;

    return await Task.find(filter).limit(limit).skip(offset).sort({ updatedAt: -1 });
  },

  overdueTasks: async () => {
    return await Task.findOverdue();
  },
};

export const taskMutations = {
  createTask: async (_: any, { input }: any) => {
    const task = new Task({
      ...input,
      completionPercentage: 0,
      comments: 0,
      tags: input.tags || [],
      dependencies: [],
      subtasks: [],
      attachments: [],
    });
    return await task.save();
  },

  updateTask: async (_: any, { id, input }: any) => {
    const task = await Task.findByIdAndUpdate(id, input, { new: true, runValidators: true });
    if (!task) {
      throw new AppError('Task not found', 404);
    }
    return task;
  },

  updateTaskProgress: async (_: any, { id, percentage }: any) => {
    const task = await Task.findById(id);
    if (!task) {
      throw new AppError('Task not found', 404);
    }
    return await task.updateProgress(percentage);
  },

  addTaskTag: async (_: any, { id, tag }: any) => {
    const task = await Task.findById(id);
    if (!task) {
      throw new AppError('Task not found', 404);
    }
    return await task.addTag(tag);
  },

  removeTaskTag: async (_: any, { id, tag }: any) => {
    const task = await Task.findById(id);
    if (!task) {
      throw new AppError('Task not found', 404);
    }
    return await task.removeTag(tag);
  },

  deleteTask: async (_: any, { id }: any) => {
    const task = await Task.findByIdAndUpdate(id, { isActive: false }, { new: true });
    return !!task;
  },
};

