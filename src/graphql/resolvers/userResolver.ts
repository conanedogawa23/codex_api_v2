import { User } from '../../models/User';
import { AppError } from '../../middleware';

export const userQueries = {
  user: async (_: any, { id }: { id: string }) => {
    const user = await User.findById(id);
    if (!user) {
      throw new AppError('User not found', 404);
    }
    return user;
  },

  users: async (_: any, { status, department, limit = 20, offset = 0 }: any) => {
    const filter: any = { isActive: true };
    if (status) filter.status = status;
    if (department) filter.department = department;

    return await User.find(filter).limit(limit).skip(offset).sort({ createdAt: -1 });
  },

  userByEmail: async (_: any, { email }: { email: string }) => {
    const user = await User.findByEmail(email);
    if (!user) {
      throw new AppError('User not found', 404);
    }
    return user;
  },

  userByGitlabId: async (_: any, { gitlabId }: { gitlabId: number }) => {
    const user = await User.findByGitlabId(gitlabId);
    if (!user) {
      throw new AppError('User not found', 404);
    }
    return user;
  },
};

export const userMutations = {
  updateUser: async (_: any, { id, input }: any) => {
    const user = await User.findByIdAndUpdate(id, input, { new: true, runValidators: true });
    if (!user) {
      throw new AppError('User not found', 404);
    }
    return user;
  },

  addUserProject: async (_: any, { id, projectId, projectName, role }: any) => {
    const user = await User.findById(id);
    if (!user) {
      throw new AppError('User not found', 404);
    }
    return await user.addProject(projectId, projectName, role);
  },

  removeUserProject: async (_: any, { id, projectId }: any) => {
    const user = await User.findById(id);
    if (!user) {
      throw new AppError('User not found', 404);
    }
    return await user.removeProject(projectId);
  },
};

