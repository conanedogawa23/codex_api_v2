import { createModule, gql } from 'graphql-modules';
import mongoose from 'mongoose';

import { jobManager } from '../../../jobs';
import {
  issueSyncQueue,
  mergeRequestSyncQueue,
  namespaceSyncQueue,
  pipelineSyncQueue,
  projectSyncQueue,
  userSyncQueue,
} from '../../../jobs/config/queue';
import { AppError } from '../../../middleware';
import { Event } from '../../../models/Event';
import { Issue } from '../../../models/Issue';
import { MergeRequest } from '../../../models/MergeRequest';
import { Pipeline } from '../../../models/Pipeline';
import { Project } from '../../../models/Project';
import { User } from '../../../models/User';
import { GraphQLContext, requireCurrentUser } from '../../../utils/auth';
import { logger } from '../../../utils/logger';
import { extractGitlabIdFromGid } from '../../../utils/rbac';

type SyncTypeValue = 'USER' | 'PROJECT' | 'ISSUE' | 'MERGE_REQUEST' | 'NAMESPACE' | 'PIPELINE';

const syncQueueMap: Record<SyncTypeValue, any> = {
  USER: userSyncQueue,
  PROJECT: projectSyncQueue,
  ISSUE: issueSyncQueue,
  MERGE_REQUEST: mergeRequestSyncQueue,
  NAMESPACE: namespaceSyncQueue,
  PIPELINE: pipelineSyncQueue,
};

function requireSuperAdmin(context: GraphQLContext) {
  const currentUser = requireCurrentUser(context);

  if (!currentUser.isSuperAdmin) {
    throw new AppError('Forbidden', 403);
  }

  return currentUser;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeProjectAssignments(projects: any[] | undefined) {
  if (!Array.isArray(projects)) {
    return [];
  }

  return projects.filter((project) => project?.id && project?.name && project?.role);
}

function toUserAccessRecord(user: any) {
  return {
    id: user._id?.toString() || user.id,
    name: user.name,
    email: user.email,
    username: user.username,
    department: user.department,
    role: user.role,
    isActive: user.isActive === true,
    isSuperAdmin: user.isSuperAdmin === true,
    projects: normalizeProjectAssignments(user.projects),
  };
}

function getProjectMembershipId(project: { _id: { toString(): string }; gitlabId?: number | null }) {
  if (typeof project.gitlabId === 'number') {
    return `gid://gitlab/Project/${project.gitlabId}`;
  }

  return project._id.toString();
}

async function resolveProjectsByIds(projectIds: string[]) {
  const objectIds = projectIds
    .filter((projectId) => mongoose.Types.ObjectId.isValid(projectId))
    .map((projectId) => new mongoose.Types.ObjectId(projectId));

  const gitlabIds = projectIds
    .map((projectId) => extractGitlabIdFromGid(projectId))
    .filter((gitlabId): gitlabId is number => gitlabId !== null);

  const projectFilters: Array<Record<string, unknown>> = [];
  if (objectIds.length > 0) {
    projectFilters.push({ _id: { $in: objectIds } });
  }
  if (gitlabIds.length > 0) {
    projectFilters.push({ gitlabId: { $in: gitlabIds } });
  }

  if (projectFilters.length === 0) {
    return [];
  }

  return Project.find(
    projectFilters.length === 1 ? projectFilters[0] : { $or: projectFilters }
  )
    .select('_id gitlabId name')
    .lean();
}

function getSyncTypeLabel(syncType: SyncTypeValue): string {
  return syncType.toLowerCase().replace(/_/g, ' ');
}

async function getLastJobAt(queue: any): Promise<Date | null> {
  const [completedJobs, failedJobs, activeJobs, waitingJobs, delayedJobs] = await Promise.all([
    queue.getJobs(['completed'], 0, 0, false),
    queue.getJobs(['failed'], 0, 0, false),
    queue.getJobs(['active'], 0, 0, false),
    queue.getJobs(['waiting'], 0, 0, false),
    queue.getJobs(['delayed'], 0, 0, false),
  ]);

  const timestamps = [...completedJobs, ...failedJobs, ...activeJobs, ...waitingJobs, ...delayedJobs]
    .map((job) => job.finishedOn || job.processedOn || job.timestamp)
    .filter((timestamp): timestamp is number => typeof timestamp === 'number' && timestamp > 0);

  if (timestamps.length === 0) {
    return null;
  }

  return new Date(Math.max(...timestamps));
}

async function getQueueStatus(syncType: SyncTypeValue) {
  const queue = syncQueueMap[syncType];
  const [counts, paused, lastJobAt] = await Promise.all([
    queue.getJobCounts(),
    queue.isPaused(),
    getLastJobAt(queue),
  ]);

  return {
    syncType,
    waiting: counts.waiting || 0,
    active: counts.active || 0,
    completed: counts.completed || 0,
    failed: counts.failed || 0,
    delayed: counts.delayed || 0,
    paused,
    lastJobAt,
  };
}

async function triggerSyncByType(syncType: SyncTypeValue): Promise<void> {
  switch (syncType) {
    case 'USER':
      await jobManager.triggerUserSync();
      return;
    case 'PROJECT':
      await jobManager.triggerProjectSync();
      return;
    case 'ISSUE':
      await jobManager.triggerIssueSync();
      return;
    case 'MERGE_REQUEST':
      await jobManager.triggerMergeRequestSync();
      return;
    case 'NAMESPACE':
      await jobManager.triggerNamespaceSync();
      return;
    case 'PIPELINE':
      await jobManager.triggerPipelineSync();
      return;
  }
}

async function pauseSyncByType(syncType: SyncTypeValue): Promise<void> {
  switch (syncType) {
    case 'USER':
      await jobManager.pauseUserSync();
      return;
    case 'PROJECT':
      await jobManager.pauseProjectSync();
      return;
    case 'ISSUE':
      await issueSyncQueue.pause();
      return;
    case 'MERGE_REQUEST':
      await mergeRequestSyncQueue.pause();
      return;
    case 'NAMESPACE':
      await namespaceSyncQueue.pause();
      return;
    case 'PIPELINE':
      await pipelineSyncQueue.pause();
      return;
  }
}

async function resumeSyncByType(syncType: SyncTypeValue): Promise<void> {
  switch (syncType) {
    case 'USER':
      await jobManager.resumeUserSync();
      return;
    case 'PROJECT':
      await jobManager.resumeProjectSync();
      return;
    case 'ISSUE':
      await issueSyncQueue.resume();
      return;
    case 'MERGE_REQUEST':
      await mergeRequestSyncQueue.resume();
      return;
    case 'NAMESPACE':
      await namespaceSyncQueue.resume();
      return;
    case 'PIPELINE':
      await pipelineSyncQueue.resume();
      return;
  }
}

export const superAdminModule = createModule({
  id: 'superAdmin',
  typeDefs: gql`
    enum SyncType {
      USER
      PROJECT
      ISSUE
      MERGE_REQUEST
      NAMESPACE
      PIPELINE
    }

    type SystemOverview {
      totalUsers: Int!
      totalProjects: Int!
      totalIssues: Int!
      totalMergeRequests: Int!
      totalPipelines: Int!
      totalSuperAdmins: Int!
      activeSyncs: Int!
    }

    type SyncQueueStatus {
      syncType: SyncType!
      waiting: Int!
      active: Int!
      completed: Int!
      failed: Int!
      delayed: Int!
      paused: Boolean!
      lastJobAt: DateTime
    }

    type UserAccessProject {
      id: String!
      name: String!
      role: String!
    }

    type UserAccessRecord {
      id: ID!
      name: String!
      email: String!
      username: String!
      department: String!
      role: String!
      isActive: Boolean!
      isSuperAdmin: Boolean!
      projects: [UserAccessProject!]!
    }

    type UserAccessResult {
      users: [UserAccessRecord!]!
      totalCount: Int!
    }

    type AuditLogResult {
      events: [Event!]!
      totalCount: Int!
    }

    type SyncMutationResult {
      success: Boolean!
      message: String!
    }

    extend type Query {
      systemOverview: SystemOverview!
      syncStatus: [SyncQueueStatus!]!
      allUserAccess(
        limit: Int = 50
        offset: Int = 0
        search: String
        department: String
        role: String
      ): UserAccessResult!
      auditLog(limit: Int = 50, offset: Int = 0): AuditLogResult!
    }

    extend type Mutation {
      assignUserToProjects(userId: ID!, projectIds: [ID!]!): UserAccessRecord!
      removeUserFromProjects(userId: ID!, projectIds: [ID!]!): UserAccessRecord!
      setSuperAdmin(userId: ID!, isSuperAdmin: Boolean!): UserAccessRecord!
      triggerSync(syncType: SyncType!): SyncMutationResult!
      pauseSync(syncType: SyncType!): SyncMutationResult!
      resumeSync(syncType: SyncType!): SyncMutationResult!
      triggerAllSyncs: SyncMutationResult!
    }
  `,
  resolvers: {
    UserAccessRecord: {
      id: (parent: any) => parent.id || parent._id?.toString(),
    },
    Query: {
      systemOverview: async (_: unknown, __: unknown, context: GraphQLContext) => {
        requireSuperAdmin(context);

        const syncStatuses = await Promise.all(
          (Object.keys(syncQueueMap) as SyncTypeValue[]).map((syncType) => getQueueStatus(syncType))
        );

        const [totalUsers, totalProjects, totalIssues, totalMergeRequests, totalPipelines, totalSuperAdmins] =
          await Promise.all([
            User.countDocuments({}),
            Project.countDocuments({ isActive: true }),
            Issue.countDocuments({ isActive: true }),
            MergeRequest.countDocuments({ isActive: true }),
            Pipeline.countDocuments({ isDeleted: false }),
            User.countDocuments({ isSuperAdmin: true }),
          ]);

        return {
          totalUsers,
          totalProjects,
          totalIssues,
          totalMergeRequests,
          totalPipelines,
          totalSuperAdmins,
          activeSyncs: syncStatuses.reduce((count, status) => count + status.active, 0),
        };
      },
      syncStatus: async (_: unknown, __: unknown, context: GraphQLContext) => {
        requireSuperAdmin(context);

        return Promise.all(
          (Object.keys(syncQueueMap) as SyncTypeValue[]).map((syncType) => getQueueStatus(syncType))
        );
      },
      allUserAccess: async (
        _: unknown,
        {
          limit = 50,
          offset = 0,
          search,
          department,
          role,
        }: { limit?: number; offset?: number; search?: string; department?: string; role?: string },
        context: GraphQLContext
      ) => {
        requireSuperAdmin(context);

        const query: Record<string, unknown> = {};
        if (department?.trim()) {
          query.department = department.trim();
        }
        if (role?.trim()) {
          query.role = role.trim();
        }
        if (search?.trim()) {
          const searchRegex = new RegExp(escapeRegex(search.trim()), 'i');
          query.$or = [
            { name: searchRegex },
            { email: searchRegex },
            { username: searchRegex },
          ];
        }

        const normalizedLimit = Math.min(Math.max(limit, 1), 200);
        const normalizedOffset = Math.max(offset, 0);

        const [users, totalCount] = await Promise.all([
          User.find(query)
            .select('name email username department role isActive isSuperAdmin projects')
            .sort({ name: 1 })
            .skip(normalizedOffset)
            .limit(normalizedLimit)
            .lean(),
          User.countDocuments(query),
        ]);

        return {
          users: users.map((user) => toUserAccessRecord(user)),
          totalCount,
        };
      },
      auditLog: async (
        _: unknown,
        { limit = 50, offset = 0 }: { limit?: number; offset?: number },
        context: GraphQLContext
      ) => {
        requireSuperAdmin(context);

        const normalizedLimit = Math.min(Math.max(limit, 1), 200);
        const normalizedOffset = Math.max(offset, 0);
        const query = { isDeleted: false };

        const [events, totalCount] = await Promise.all([
          Event.find(query)
            .sort({ createdAt: -1 })
            .skip(normalizedOffset)
            .limit(normalizedLimit)
            .lean(),
          Event.countDocuments(query),
        ]);

        return {
          events,
          totalCount,
        };
      },
    },
    Mutation: {
      assignUserToProjects: async (
        _: unknown,
        { userId, projectIds }: { userId: string; projectIds: string[] },
        context: GraphQLContext
      ) => {
        const currentUser = requireSuperAdmin(context);
        const user = await User.findById(userId);

        if (!user) {
          throw new AppError('User not found', 404);
        }

        const projects = await resolveProjectsByIds(projectIds);
        if (projectIds.length > 0 && projects.length === 0) {
          throw new AppError('No matching projects found', 404);
        }

        const existingProjectIds = new Set((user.projects || []).map((project) => project.id));
        user.projects = user.projects || [];

        for (const project of projects) {
          const membershipId = getProjectMembershipId(project);
          if (!existingProjectIds.has(membershipId)) {
            user.projects.push({
              id: membershipId,
              name: project.name,
              role: 'Member',
            });
            existingProjectIds.add(membershipId);
          }
        }

        await user.save();

        logger.info('Assigned user to projects from super admin module', {
          actingUserId: currentUser.userId,
          targetUserId: userId,
          projectCount: projects.length,
        });

        const updatedUser = await User.findById(userId)
          .select('name email username department role isActive isSuperAdmin projects')
          .lean();

        if (!updatedUser) {
          throw new AppError('User not found after assignment', 404);
        }

        return toUserAccessRecord(updatedUser);
      },
      removeUserFromProjects: async (
        _: unknown,
        { userId, projectIds }: { userId: string; projectIds: string[] },
        context: GraphQLContext
      ) => {
        const currentUser = requireSuperAdmin(context);
        const user = await User.findById(userId);

        if (!user) {
          throw new AppError('User not found', 404);
        }

        const removalTargets = new Set(projectIds);
        const projects = await resolveProjectsByIds(projectIds);

        for (const project of projects) {
          removalTargets.add(project._id.toString());
          removalTargets.add(getProjectMembershipId(project));
        }

        for (const projectId of projectIds) {
          const gitlabId = extractGitlabIdFromGid(projectId);
          if (gitlabId !== null) {
            removalTargets.add(`gid://gitlab/Project/${gitlabId}`);
          }
        }

        user.projects = normalizeProjectAssignments(user.projects).filter(
          (project) => !removalTargets.has(project.id)
        );
        await user.save();

        logger.info('Removed user from projects from super admin module', {
          actingUserId: currentUser.userId,
          targetUserId: userId,
          projectCount: projectIds.length,
        });

        const updatedUser = await User.findById(userId)
          .select('name email username department role isActive isSuperAdmin projects')
          .lean();

        if (!updatedUser) {
          throw new AppError('User not found after project removal', 404);
        }

        return toUserAccessRecord(updatedUser);
      },
      setSuperAdmin: async (
        _: unknown,
        { userId, isSuperAdmin }: { userId: string; isSuperAdmin: boolean },
        context: GraphQLContext
      ) => {
        const currentUser = requireSuperAdmin(context);
        const user = await User.findById(userId);

        if (!user) {
          throw new AppError('User not found', 404);
        }

        user.isSuperAdmin = isSuperAdmin;
        await user.save();

        logger.info('Updated super admin access', {
          actingUserId: currentUser.userId,
          targetUserId: userId,
          isSuperAdmin,
        });

        return toUserAccessRecord(user.toObject());
      },
      triggerSync: async (
        _: unknown,
        { syncType }: { syncType: SyncTypeValue },
        context: GraphQLContext
      ) => {
        requireSuperAdmin(context);

        await triggerSyncByType(syncType);

        return {
          success: true,
          message: `${getSyncTypeLabel(syncType)} sync triggered successfully`,
        };
      },
      pauseSync: async (
        _: unknown,
        { syncType }: { syncType: SyncTypeValue },
        context: GraphQLContext
      ) => {
        requireSuperAdmin(context);

        await pauseSyncByType(syncType);

        return {
          success: true,
          message: `${getSyncTypeLabel(syncType)} sync paused successfully`,
        };
      },
      resumeSync: async (
        _: unknown,
        { syncType }: { syncType: SyncTypeValue },
        context: GraphQLContext
      ) => {
        requireSuperAdmin(context);

        await resumeSyncByType(syncType);

        return {
          success: true,
          message: `${getSyncTypeLabel(syncType)} sync resumed successfully`,
        };
      },
      triggerAllSyncs: async (_: unknown, __: unknown, context: GraphQLContext) => {
        requireSuperAdmin(context);

        for (const syncType of Object.keys(syncQueueMap) as SyncTypeValue[]) {
          await triggerSyncByType(syncType);
        }

        return {
          success: true,
          message: 'All syncs triggered successfully',
        };
      },
    },
  },
});
