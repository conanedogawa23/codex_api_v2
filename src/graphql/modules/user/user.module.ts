import { randomInt } from 'crypto';

import { createModule, gql } from 'graphql-modules';
import { User } from '../../../models/User';
import { Department } from '../../../models/Department';
import { AppError } from '../../../middleware';
import { GraphQLContext, requireCurrentUser } from '../../../utils/auth';
import {
  ACCESS_ROLE,
  canManageDepartmentUsers,
  getPermissionsForAccessRole,
  normalizeAccessRole,
} from '../../../utils/accessControl';
import { logger } from '../../../utils/logger';
import { isDepartmentInScope, requireDepartmentScope } from '../../../utils/rbac';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_SANITIZE_REGEX = /[^a-z0-9._-]/g;
const USERNAME_EDGE_TRIM_REGEX = /^[-_.]+|[-_.]+$/g;

function normalizeUserStatus(status?: string): string {
  return status ? status.toLowerCase().replace(/_/g, '-') : 'active';
}

function buildBaseUsername(email: string): string {
  const localPart = email.split('@')[0]?.toLowerCase().trim() || '';
  const username = localPart
    .replace(USERNAME_SANITIZE_REGEX, '_')
    .replace(/_+/g, '_')
    .replace(USERNAME_EDGE_TRIM_REGEX, '');

  return username || `user_${randomInt(1000, 10000)}`;
}

async function generateUniqueUsername(baseUsername: string): Promise<string> {
  const existingUser = await User.findOne({ username: baseUsername }).select('_id').lean();
  if (!existingUser) {
    return baseUsername;
  }

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidateUsername = `${baseUsername}_${randomInt(1000, 10000)}`;
    const candidateExists = await User.findOne({ username: candidateUsername }).select('_id').lean();

    if (!candidateExists) {
      return candidateUsername;
    }
  }

  throw new AppError('Unable to generate a unique username. Please try again.', 500);
}

function assertPrivilegedAccessRoleWriteAllowed(
  currentUser: ReturnType<typeof requireCurrentUser>,
  accessRole?: string | null
) {
  if (currentUser.isSuperAdmin || !accessRole) {
    return;
  }

  const normalizedAccessRole = normalizeAccessRole(accessRole);
  if (
    normalizedAccessRole === ACCESS_ROLE.CLUSTER_SUPER_ADMIN ||
    normalizedAccessRole === ACCESS_ROLE.FINANCE
  ) {
    throw new AppError('Only platform super admins can assign this access role', 403);
  }
}

function requireDepartmentUserAdmin(
  context: GraphQLContext,
  department: string | undefined | null
) {
  const currentUser = requireCurrentUser(context);

  if (!canManageDepartmentUsers(currentUser.accessRole, currentUser.isSuperAdmin)) {
    throw new AppError('Forbidden', 403);
  }

  requireDepartmentScope(context, department);
  return currentUser;
}

function requireUserVisibility(context: GraphQLContext, user: any) {
  const currentUser = requireCurrentUser(context);
  const targetUserId = user._id?.toString() || user.id;

  if (currentUser.isSuperAdmin || currentUser.userId === targetUserId) {
    return currentUser;
  }

  requireDepartmentScope(context, user.department);
  return currentUser;
}

const ZOHO_SPRINTS_INTEGRATION_KEYS = [
  'zohoSprintsUserId',
  'zohoSprintsRoleId',
  'zohoSprintsProfileId',
] as const;

function inputTouchesZohoSprintsIntegration(input: Record<string, unknown>): boolean {
  return ZOHO_SPRINTS_INTEGRATION_KEYS.some((key) =>
    Object.prototype.hasOwnProperty.call(input, key)
  );
}

function assertSuperAdminCanMutateZohoSprintsIntegration(
  currentUser: ReturnType<typeof requireCurrentUser>,
  input: Record<string, unknown>
): void {
  if (inputTouchesZohoSprintsIntegration(input) && !currentUser.isSuperAdmin) {
    throw new AppError('Only super admins can set Zoho Sprints integration fields', 403);
  }
}

function normalizeZohoSprintsIntegrationOnUpdatePayload(dbInput: Record<string, unknown>): void {
  for (const key of ZOHO_SPRINTS_INTEGRATION_KEYS) {
    if (dbInput[key] === '') {
      dbInput[key] = undefined;
    }
  }
}

function extractZohoSprintsIntegrationForNewUser(
  input: Record<string, unknown>
): Partial<Record<(typeof ZOHO_SPRINTS_INTEGRATION_KEYS)[number], string>> {
  const out: Partial<Record<(typeof ZOHO_SPRINTS_INTEGRATION_KEYS)[number], string>> = {};
  for (const key of ZOHO_SPRINTS_INTEGRATION_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(input, key)) {
      continue;
    }
    const raw = input[key];
    if (raw === '' || raw === null || raw === undefined) {
      continue;
    }
    const trimmed = String(raw).trim();
    if (trimmed.length > 0) {
      out[key] = trimmed;
    }
  }
  return out;
}

export const userModule = createModule({
  id: 'user',
  typeDefs: gql`
    type User {
      id: ID!
      gitlabId: Int
      name: String!
      email: String!
      username: String!
      role: String!
      accessRole: AccessRole!
      permissions: [Permission!]!
      department: String!
      departmentDetails: Department
      userType: String!
      avatar: String
      webUrl: String
      joinDate: DateTime!
      status: UserStatus!
      skills: [String!]!
      assignedRepos: [String!]!
      projects: [UserProject!]!
      settings: UserSettings
      lastSynced: DateTime!
      isActive: Boolean!
      source: String
      zohoSprintsUserId: String
      zohoSprintsRoleId: String
      zohoSprintsProfileId: String
      createdAt: DateTime!
      updatedAt: DateTime!
    }

    """
    OrganizationUser is an alias for User type for frontend compatibility
    """
    type OrganizationUser {
      id: ID!
      gitlabId: Int
      name: String!
      email: String!
      username: String!
      role: String!
      accessRole: AccessRole!
      permissions: [Permission!]!
      department: String!
      departmentDetails: Department
      userType: String!
      avatar: String
      webUrl: String
      joinDate: DateTime!
      status: UserStatus!
      skills: [String!]!
      assignedRepos: [String!]!
      projects: [UserProject!]!
      settings: UserSettings
      lastSynced: DateTime!
      isActive: Boolean!
      source: String
      zohoSprintsUserId: String
      zohoSprintsRoleId: String
      zohoSprintsProfileId: String
      createdAt: DateTime!
      updatedAt: DateTime!
    }

    type OrganizationUsersResult {
      users: [OrganizationUser!]!
      totalCount: Int!
    }

    enum UserStatus {
      ACTIVE
      INACTIVE
      ON_LEAVE
    }

    type UserProject {
      id: String!
      name: String!
      role: String!
    }

    type NotificationSettings {
      email: Boolean
      push: Boolean
      inApp: Boolean
      marketing: Boolean
      updates: Boolean
      teamActivity: Boolean
      mentions: Boolean
      reminders: Boolean
      projectUpdates: Boolean
      taskAssignments: Boolean
      deadlineReminders: Boolean
      desktop: Boolean
    }

    type DisplaySettings {
      theme: String
      density: String
      iconSize: String
      animations: Boolean
      sounds: Boolean
      showHelp: Boolean
      dashboardLayout: String
      showCompleted: Boolean
    }

    type PrivacySettings {
      showOnlineStatus: Boolean
      showActivity: Boolean
      allowDataCollection: Boolean
      shareUsageData: Boolean
      showEmail: Boolean
      publicProfile: Boolean
      showActiveStatus: Boolean
      shareAnalytics: Boolean
    }

    type IntegrationConnection {
      name: String!
      connected: Boolean!
      lastSynced: String
    }

    type UserSettings {
      notifications: NotificationSettings
      display: DisplaySettings
      privacy: PrivacySettings
      integrations: [IntegrationConnection!]
      dismissedNotifications: [String!]
    }

    input NotificationSettingsInput {
      email: Boolean
      push: Boolean
      inApp: Boolean
      marketing: Boolean
      updates: Boolean
      teamActivity: Boolean
      mentions: Boolean
      reminders: Boolean
      projectUpdates: Boolean
      taskAssignments: Boolean
      deadlineReminders: Boolean
      desktop: Boolean
    }

    input DisplaySettingsInput {
      theme: String
      density: String
      iconSize: String
      animations: Boolean
      sounds: Boolean
      showHelp: Boolean
      dashboardLayout: String
      showCompleted: Boolean
    }

    input PrivacySettingsInput {
      showOnlineStatus: Boolean
      showActivity: Boolean
      allowDataCollection: Boolean
      shareUsageData: Boolean
      showEmail: Boolean
      publicProfile: Boolean
      showActiveStatus: Boolean
      shareAnalytics: Boolean
    }

    input IntegrationConnectionInput {
      name: String!
      connected: Boolean!
      lastSynced: String
    }

    input UserSettingsInput {
      notifications: NotificationSettingsInput
      display: DisplaySettingsInput
      privacy: PrivacySettingsInput
      integrations: [IntegrationConnectionInput!]
      dismissedNotifications: [String!]
    }

    input UpdateUserInput {
      role: String
      accessRole: AccessRole
      department: String
      status: UserStatus
      skills: [String!]
      zohoSprintsUserId: String
      zohoSprintsRoleId: String
      zohoSprintsProfileId: String
    }

    input CreateUserInput {
      name: String!
      email: String!
      role: String!
      accessRole: AccessRole
      department: String!
      status: UserStatus
      skills: [String!]
      assignedRepos: [String!]
      zohoSprintsUserId: String
      zohoSprintsRoleId: String
      zohoSprintsProfileId: String
    }

    input UserFilterInput {
      status: UserStatus
      department: String
      role: String
      accessRole: AccessRole
      isActive: Boolean
      search: String
      limit: Int
      offset: Int
    }

    extend type Query {
      user(id: ID!): User
      users(
        status: UserStatus
        department: String
        limit: Int = 20
        offset: Int = 0
      ): [User!]!
      organizationUsers(filter: UserFilterInput): OrganizationUsersResult!
      userByEmail(email: String!): User
      userByGitlabId(gitlabId: Int!): User
      userSettings(userId: ID!): UserSettings
    }

    extend type Mutation {
      createUser(input: CreateUserInput!): OrganizationUser!
      updateUser(id: ID!, input: UpdateUserInput!): OrganizationUser
      addUserProject(id: ID!, projectId: String!, projectName: String!, role: String!): OrganizationUser
      removeUserProject(id: ID!, projectId: String!): OrganizationUser
      updateUserSettings(userId: ID!, settings: UserSettingsInput!): UserSettings
      dismissNotification(userId: ID!, notificationId: String!): UserSettings
      dismissAllNotifications(userId: ID!, notificationIds: [String!]!): UserSettings
    }
  `,
  resolvers: {
    User: {
      id: (parent: any) => parent._id?.toString() || parent.id,
      accessRole: (parent: any) => normalizeAccessRole(parent.accessRole),
      permissions: (parent: any) =>
        getPermissionsForAccessRole(parent.accessRole, parent.isSuperAdmin === true),
      status: (parent: any) => {
        // Convert DB format (lowercase with hyphen) to GraphQL format (uppercase with underscore)
        // DB: 'on-leave' -> GraphQL: 'ON_LEAVE'
        return parent.status?.replace(/-/g, '_').toUpperCase();
      },
      userType: (parent: any) => parent.userType || 'human',
      joinDate: (parent: any) => parent.joinDate || parent.createdAt || new Date(),
      lastSynced: (parent: any) => parent.lastSynced || parent.createdAt || new Date(),
      createdAt: (parent: any) => parent.createdAt || parent.joinDate || new Date(),
      updatedAt: (parent: any) => parent.updatedAt || parent.lastSynced || parent.createdAt || new Date(),
      
      // Filter out malformed project entries to prevent non-null violations
      projects: (parent: any) => {
        if (!parent.projects || !Array.isArray(parent.projects)) return [];
        return parent.projects.filter(
          (p: any) => p && p.id && p.name && p.role
        );
      },
      
      // Resolve department details
      departmentDetails: async (parent: any) => {
        if (!parent.department) {
          return null;
        }
        
        const department = await Department.findOne({ name: parent.department }).lean();
        return department;
      },
    },
    
    OrganizationUser: {
      id: (parent: any) => parent._id?.toString() || parent.id,
      accessRole: (parent: any) => normalizeAccessRole(parent.accessRole),
      permissions: (parent: any) =>
        getPermissionsForAccessRole(parent.accessRole, parent.isSuperAdmin === true),
      status: (parent: any) => {
        return parent.status?.replace(/-/g, '_').toUpperCase();
      },
      userType: (parent: any) => parent.userType || 'human',
      joinDate: (parent: any) => parent.joinDate || parent.createdAt || new Date(),
      lastSynced: (parent: any) => parent.lastSynced || parent.createdAt || new Date(),
      createdAt: (parent: any) => parent.createdAt || parent.joinDate || new Date(),
      updatedAt: (parent: any) => parent.updatedAt || parent.lastSynced || parent.createdAt || new Date(),
      
      // Filter out malformed project entries to prevent non-null violations
      projects: (parent: any) => {
        if (!parent.projects || !Array.isArray(parent.projects)) return [];
        return parent.projects.filter(
          (p: any) => p && p.id && p.name && p.role
        );
      },
      
      // Resolve department details
      departmentDetails: async (parent: any) => {
        if (!parent.department) {
          return null;
        }
        
        const department = await Department.findOne({ name: parent.department }).lean();
        return department;
      },
    },
    
    Query: {
      user: async (_: any, { id }: { id: string }, context: GraphQLContext) => {
        requireCurrentUser(context);
        const user = await User.findById(id).lean();
        if (!user) {
          throw new AppError('User not found', 404);
        }
        requireUserVisibility(context, user);
        return user;
      },
      users: async (_: any, { status, department, limit = 20, offset = 0 }: any, context: GraphQLContext) => {
        const currentUser = requireCurrentUser(context);
        const filter: any = {};
        // Convert GraphQL enum to DB format
        if (status) filter.status = status.toLowerCase().replace(/_/g, '-');
        if (department) {
          filter.department = currentUser.isSuperAdmin
            ? department
            : requireDepartmentScope(context, department);
        } else if (!currentUser.isSuperAdmin) {
          filter.department = requireDepartmentScope(context, currentUser.department);
        }
        return await User.find(filter).limit(limit).skip(offset).sort({ createdAt: -1 }).lean();
      },
      userByEmail: async (_: any, { email }: { email: string }, context: GraphQLContext) => {
        requireCurrentUser(context);
        const user = await User.findByEmail(email);
        if (!user) {
          throw new AppError('User not found', 404);
        }
        requireUserVisibility(context, user);
        return user;
      },
      organizationUsers: async (_: any, { filter }: { filter?: any }, context: GraphQLContext) => {
        try {
          const currentUser = requireCurrentUser(context);
          const query: any = {};

          // Apply filters if provided
          if (filter) {
            if (filter.status !== undefined) {
              // Convert GraphQL enum to DB format
              query.status = filter.status.toLowerCase().replace(/_/g, '-');
            }
            if (filter.department !== undefined) {
              query.department = currentUser.isSuperAdmin
                ? filter.department
                : requireDepartmentScope(context, filter.department);
            }
            if (filter.role !== undefined) {
              query.role = filter.role;
            }
            if (filter.accessRole !== undefined) {
              query.accessRole = normalizeAccessRole(filter.accessRole);
            }
            if (filter.isActive !== undefined) {
              query.isActive = filter.isActive;
            }
            if (filter.search) {
              // Search in name, email, or username
              query.$or = [
                { name: { $regex: filter.search, $options: 'i' } },
                { email: { $regex: filter.search, $options: 'i' } },
                { username: { $regex: filter.search, $options: 'i' } }
              ];
            }
          } else {
            // Default: only active users if no filter provided
            query.isActive = true;
          }

          if (!currentUser.isSuperAdmin) {
            query.department = query.department || requireDepartmentScope(context, currentUser.department);
          }

          const limit = filter?.limit || 100;
          const offset = filter?.offset || 0;
          const [users, totalCount] = await Promise.all([
            User.find(query)
              .limit(limit)
              .skip(offset)
              .sort({ name: 1 })
              .lean(),
            User.countDocuments(query),
          ]);

          return {
            users,
            totalCount,
          };
        } catch (error) {
          logger.error('Error fetching organization users', {
            filter,
            error,
          });
          throw new AppError('Failed to fetch organization users', 500);
        }
      },
      userByGitlabId: async (_: any, { gitlabId }: { gitlabId: number }, context: GraphQLContext) => {
        requireCurrentUser(context);
        const user = await User.findByGitlabId(gitlabId);
        if (!user) {
          throw new AppError('User not found', 404);
        }
        requireUserVisibility(context, user);
        return user;
      },
      userSettings: async (_: any, { userId }: { userId: string }, context: GraphQLContext) => {
        const currentUser = requireCurrentUser(context);
        if (!currentUser.isSuperAdmin && currentUser.userId !== userId) {
          throw new AppError('Forbidden', 403);
        }
        const user = await User.findById(userId).select('settings').lean();
        if (!user) {
          throw new AppError('User not found', 404);
        }
        
        // Return default settings if none exist
        if (!user.settings) {
          return {
            notifications: {
              email: true,
              push: true,
              inApp: true,
              marketing: false,
              updates: true,
              teamActivity: true,
              mentions: true,
              reminders: true,
              projectUpdates: true,
              taskAssignments: true,
              deadlineReminders: true,
              desktop: true,
            },
            display: {
              theme: 'system',
              density: 'comfortable',
              iconSize: 'medium',
              animations: true,
              sounds: true,
              showHelp: true,
              dashboardLayout: 'grid',
              showCompleted: true,
            },
            privacy: {
              showOnlineStatus: true,
              showActivity: true,
              allowDataCollection: true,
              shareUsageData: false,
              showEmail: true,
              publicProfile: true,
              showActiveStatus: true,
              shareAnalytics: false,
            },
            integrations: [],
            dismissedNotifications: [],
          };
        }
        
        return user.settings;
      },
    },
    Mutation: {
      createUser: async (_: any, { input }: any, context: GraphQLContext) => {
        const currentUser = requireDepartmentUserAdmin(context, input.department);
        assertSuperAdminCanMutateZohoSprintsIntegration(currentUser, input);

        const name = input.name?.trim();
        const email = input.email?.trim().toLowerCase();
        const role = input.role?.trim();
        const accessRole = normalizeAccessRole(input.accessRole);
        const department = input.department?.trim();

        if (!name || !email || !role || !department) {
          throw new AppError('Name, email, role, and department are required', 400);
        }

        if (!EMAIL_REGEX.test(email)) {
          throw new AppError('Please enter a valid email address', 400);
        }

        assertPrivilegedAccessRoleWriteAllowed(currentUser, accessRole);

        const existingEmailUser = await User.findOne({ email }).select('_id').lean();
        if (existingEmailUser) {
          throw new AppError('A user with this email already exists', 409);
        }

        const username = await generateUniqueUsername(buildBaseUsername(email));
        const zohoSprintsIntegration = extractZohoSprintsIntegrationForNewUser(input);

        const user = new User({
          assignedRepos: input.assignedRepos || [],
          canSyncFromGitlab: false,
          department,
          email,
          isActive: true,
          joinDate: new Date(),
          lastSynced: new Date(),
          name,
          projects: [],
          role,
          accessRole,
          skills: input.skills || [],
          status: normalizeUserStatus(input.status),
          userSource: 'manual',
          userType: 'human',
          username,
          ...zohoSprintsIntegration,
        });

        try {
          await user.save();

          logger.info('Manual user created', {
            email: user.email,
            userId: user._id.toString(),
            username: user.username,
          });

          return user;
        } catch (error: any) {
          if (error?.code === 11000) {
            if (error?.keyPattern?.email) {
              throw new AppError('A user with this email already exists', 409);
            }

            if (error?.keyPattern?.username) {
              throw new AppError('A user with this username already exists', 409);
            }

            if (error?.keyPattern?.zohoSprintsUserId) {
              throw new AppError('A user with this Zoho Sprints user id already exists', 409);
            }
          }

          logger.error('Failed to create manual user', {
            email,
            error: error?.message,
          });

          throw error;
        }
      },
      updateUser: async (_: any, { id, input }: any, context: GraphQLContext) => {
        const currentUser = requireCurrentUser(context);

        // Convert GraphQL enum to DB format
        const dbInput = { ...input };
        if (dbInput.status) dbInput.status = normalizeUserStatus(dbInput.status);
        if (dbInput.accessRole) dbInput.accessRole = normalizeAccessRole(dbInput.accessRole);

        assertSuperAdminCanMutateZohoSprintsIntegration(currentUser, input);
        normalizeZohoSprintsIntegrationOnUpdatePayload(dbInput);

        const existingUser = await User.findById(id);
        if (!existingUser) {
          throw new AppError('User not found', 404);
        }

        if (!currentUser.isSuperAdmin) {
          requireDepartmentUserAdmin(context, existingUser.department);

          if (!isDepartmentInScope(currentUser, existingUser.department) || existingUser.isSuperAdmin) {
            throw new AppError('Forbidden', 403);
          }

          const targetAccessRole = normalizeAccessRole(existingUser.accessRole);
          if (
            targetAccessRole === ACCESS_ROLE.CLUSTER_SUPER_ADMIN ||
            targetAccessRole === ACCESS_ROLE.FINANCE
          ) {
            throw new AppError('Forbidden', 403);
          }

          if (dbInput.department) {
            requireDepartmentScope(context, dbInput.department);
          }

          assertPrivilegedAccessRoleWriteAllowed(currentUser, dbInput.accessRole);
        }

        try {
          const user = await User.findByIdAndUpdate(id, dbInput, { new: true, runValidators: true });
          if (!user) {
            throw new AppError('User not found', 404);
          }
          return user;
        } catch (error: any) {
          if (error?.code === 11000 && error?.keyPattern?.zohoSprintsUserId) {
            throw new AppError('A user with this Zoho Sprints user id already exists', 409);
          }
          throw error;
        }
      },
      addUserProject: async (_: any, { id, projectId, projectName, role }: any, context: GraphQLContext) => {
        const user = await User.findById(id);
        if (!user) {
          throw new AppError('User not found', 404);
        }
        const currentUser = requireDepartmentUserAdmin(context, user.department);
        if (!currentUser.isSuperAdmin && user.isSuperAdmin) {
          throw new AppError('Forbidden', 403);
        }
        await user.addProject(projectId, projectName, role);
        return await User.findById(id).lean(); // Return updated user as lean object
      },
      removeUserProject: async (_: any, { id, projectId }: any, context: GraphQLContext) => {
        const user = await User.findById(id);
        if (!user) {
          throw new AppError('User not found', 404);
        }
        const currentUser = requireDepartmentUserAdmin(context, user.department);
        if (!currentUser.isSuperAdmin && user.isSuperAdmin) {
          throw new AppError('Forbidden', 403);
        }
        await user.removeProject(projectId);
        return await User.findById(id).lean(); // Return updated user as lean object
      },
      updateUserSettings: async (
        _: any,
        { userId, settings }: { userId: string; settings: any },
        context: GraphQLContext
      ) => {
        const currentUser = requireCurrentUser(context);
        if (!currentUser.isSuperAdmin && currentUser.userId !== userId) {
          throw new AppError('Forbidden', 403);
        }
        const user = await User.findById(userId);
        if (!user) {
          throw new AppError('User not found', 404);
        }

        // Deep merge settings to preserve existing nested values not included in update
        const currentSettings = user.settings || {};
        const updatedSettings = {
          notifications: {
            ...(currentSettings.notifications || {}),
            ...(settings.notifications || {}),
          },
          display: {
            ...(currentSettings.display || {}),
            ...(settings.display || {}),
          },
          privacy: {
            ...(currentSettings.privacy || {}),
            ...(settings.privacy || {}),
          },
          integrations: settings.integrations !== undefined 
            ? settings.integrations 
            : (currentSettings.integrations || []),
          dismissedNotifications: settings.dismissedNotifications !== undefined
            ? settings.dismissedNotifications
            : (currentSettings.dismissedNotifications || []),
        };

        user.settings = updatedSettings;
        await user.save();

        return updatedSettings;
      },
      dismissNotification: async (
        _: any,
        { userId, notificationId }: { userId: string; notificationId: string },
        context: GraphQLContext
      ) => {
        const currentUser = requireCurrentUser(context);
        if (!currentUser.isSuperAdmin && currentUser.userId !== userId) {
          throw new AppError('Forbidden', 403);
        }
        const user = await User.findById(userId);
        if (!user) {
          throw new AppError('User not found', 404);
        }

        if (!user.settings) {
          user.settings = {} as any;
        }
        if (!user.settings?.dismissedNotifications) {
          user.settings!.dismissedNotifications = [];
        }

        // Add to dismissed list if not already there
        if (!user.settings?.dismissedNotifications.includes(notificationId)) {
          user.settings!.dismissedNotifications.push(notificationId);
          await user.save();
        }

        return user.settings;
      },
      dismissAllNotifications: async (
        _: any,
        { userId, notificationIds }: { userId: string; notificationIds: string[] },
        context: GraphQLContext
      ) => {
        const currentUser = requireCurrentUser(context);
        if (!currentUser.isSuperAdmin && currentUser.userId !== userId) {
          throw new AppError('Forbidden', 403);
        }
        const user = await User.findById(userId);
        if (!user) {
          throw new AppError('User not found', 404);
        }

        // Initialize settings structure if missing
        const settings = user.settings || ({} as NonNullable<typeof user.settings>);
        const currentDismissed = settings.dismissedNotifications || [];

        // Merge new IDs with existing dismissed notifications (deduplicated)
        const mergedSet = new Set(currentDismissed);
        for (const id of notificationIds) {
          mergedSet.add(id);
        }

        user.settings = {
          ...settings,
          dismissedNotifications: Array.from(mergedSet),
        };

        await user.save();

        return user.settings;
      },
    },
  },
});
