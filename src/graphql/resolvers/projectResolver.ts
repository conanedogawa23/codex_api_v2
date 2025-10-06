import { Project } from '../../models/Project';
import { AppError } from '../../middleware';

export const projectQueries = {
  project: async (_: any, { id }: { id: string }) => {
    const project = await Project.findById(id);
    if (!project) {
      throw new AppError('Project not found', 404);
    }
    return project;
  },

  projects: async (_: any, { status, priority, department, category, limit = 20, offset = 0 }: any) => {
    const filter: any = { isActive: true };
    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    if (department) filter.department = department;
    if (category) filter.category = category;

    return await Project.find(filter).limit(limit).skip(offset).sort({ lastActivityAt: -1 });
  },

  projectByGitlabId: async (_: any, { gitlabId }: { gitlabId: number }) => {
    const project = await Project.findByGitlabId(gitlabId);
    if (!project) {
      throw new AppError('Project not found', 404);
    }
    return project;
  },

  overdueProjects: async () => {
    return await Project.findOverdue();
  },
};

export const projectMutations = {
  updateProject: async (_: any, { id, input }: any) => {
    const project = await Project.findByIdAndUpdate(id, input, { new: true, runValidators: true });
    if (!project) {
      throw new AppError('Project not found', 404);
    }
    return project;
  },

  updateProjectProgress: async (_: any, { id, progress }: any) => {
    const project = await Project.findById(id);
    if (!project) {
      throw new AppError('Project not found', 404);
    }
    return await project.updateProgress(progress);
  },

  assignUserToProject: async (_: any, { projectId, userId, userName, role, department }: any) => {
    const project = await Project.findById(projectId);
    if (!project) {
      throw new AppError('Project not found', 404);
    }
    return await project.assignUser(userId, userName, role, department);
  },

  unassignUserFromProject: async (_: any, { projectId, userId }: any) => {
    const project = await Project.findById(projectId);
    if (!project) {
      throw new AppError('Project not found', 404);
    }
    return await project.unassignUser(userId);
  },
};

