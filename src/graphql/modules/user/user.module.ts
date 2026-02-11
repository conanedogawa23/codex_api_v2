import { createModule, gql } from 'graphql-modules';
import { User } from '../../../models/User';
import { Department } from '../../../models/Department';
import { AppError } from '../../../middleware';

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
      department: String
      status: UserStatus
      skills: [String!]
    }

    input UserFilterInput {
      status: UserStatus
      department: String
      role: String
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
      organizationUsers(filter: UserFilterInput): [OrganizationUser!]!
      userByEmail(email: String!): User
      userByGitlabId(gitlabId: Int!): User
      userSettings(userId: ID!): UserSettings
    }

    extend type Mutation {
      updateUser(id: ID!, input: UpdateUserInput!): User
      addUserProject(id: ID!, projectId: String!, projectName: String!, role: String!): User
      removeUserProject(id: ID!, projectId: String!): User
      updateUserSettings(userId: ID!, settings: UserSettingsInput!): UserSettings
      dismissNotification(userId: ID!, notificationId: String!): UserSettings
      dismissAllNotifications(userId: ID!, notificationIds: [String!]!): UserSettings
    }
  `,
  resolvers: {
    User: {
      id: (parent: any) => parent._id?.toString() || parent.id,
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
      status: (parent: any) => {
        return parent.status?.replace(/-/g, '_').toUpperCase();
      },
      userType: (parent: any) => parent.userType || 'human',
      joinDate: (parent: any) => parent.joinDate || parent.createdAt || new Date(),
      lastSynced: (parent: any) => parent.lastSynced || parent.createdAt || new Date(),
      createdAt: (parent: any) => parent.createdAt || parent.joinDate || new Date(),
      updatedAt: (parent: any) => parent.updatedAt || parent.lastSynced || parent.createdAt || new Date(),
      
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
      user: async (_: any, { id }: { id: string }) => {
        const user = await User.findById(id).lean();
        if (!user) {
          throw new AppError('User not found', 404);
        }
        return user;
      },
      users: async (_: any, { status, department, limit = 20, offset = 0 }: any) => {
        const filter: any = {};
        // Convert GraphQL enum to DB format
        if (status) filter.status = status.toLowerCase().replace(/_/g, '-');
        if (department) filter.department = department;
        return await User.find(filter).limit(limit).skip(offset).sort({ createdAt: -1 }).lean();
      },
      userByEmail: async (_: any, { email }: { email: string }) => {
        const user = await User.findByEmail(email);
        if (!user) {
          throw new AppError('User not found', 404);
        }
        return user;
      },
      organizationUsers: async (_: any, { filter }: { filter?: any }) => {
        const query: any = {};
        
        // Apply filters if provided
        if (filter) {
          if (filter.status !== undefined) {
            // Convert GraphQL enum to DB format
            query.status = filter.status.toLowerCase().replace(/_/g, '-');
          }
          if (filter.department !== undefined) {
            query.department = filter.department;
          }
          if (filter.role !== undefined) {
            query.role = filter.role;
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
        
        const limit = filter?.limit || 100;
        const offset = filter?.offset || 0;
        
        return await User.find(query)
          .limit(limit)
          .skip(offset)
          .sort({ name: 1 })
          .lean();
      },
      userByGitlabId: async (_: any, { gitlabId }: { gitlabId: number }) => {
        const user = await User.findByGitlabId(gitlabId);
        if (!user) {
          throw new AppError('User not found', 404);
        }
        return user;
      },
      userSettings: async (_: any, { userId }: { userId: string }) => {
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
      updateUser: async (_: any, { id, input }: any) => {
        // Convert GraphQL enum to DB format
        const dbInput = { ...input };
        if (dbInput.status) dbInput.status = dbInput.status.toLowerCase().replace(/_/g, '-');
        
        const user = await User.findByIdAndUpdate(id, dbInput, { new: true, runValidators: true });
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
        await user.addProject(projectId, projectName, role);
        return await User.findById(id).lean(); // Return updated user as lean object
      },
      removeUserProject: async (_: any, { id, projectId }: any) => {
        const user = await User.findById(id);
        if (!user) {
          throw new AppError('User not found', 404);
        }
        await user.removeProject(projectId);
        return await User.findById(id).lean(); // Return updated user as lean object
      },
      updateUserSettings: async (_: any, { userId, settings }: { userId: string; settings: any }) => {
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
      dismissNotification: async (_: any, { userId, notificationId }: { userId: string; notificationId: string }) => {
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
      dismissAllNotifications: async (_: any, { userId, notificationIds }: { userId: string; notificationIds: string[] }) => {
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
