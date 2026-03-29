import mongoose, { Document, Schema } from 'mongoose';

import { ACCESS_ROLE_VALUES, DEFAULT_ACCESS_ROLE, type AccessRole } from '../utils/accessControl';

// Static method interfaces
interface IUserModel extends mongoose.Model<IUser> {
  findByGitlabId(gitlabId: number): Promise<IUser | null>;
  findByEmail(email: string): Promise<IUser | null>;
  findByDepartment(department: string): Promise<IUser[]>;
}

export interface IUser extends Document {
  // Core Identity
  gitlabId?: number;
  name: string;
  email: string;
  username: string;
  role: string;
  accessRole: AccessRole;
  department: string;
  avatar?: string;
  joinDate: Date;
  status: 'active' | 'inactive' | 'on-leave';
  userType: 'human' | 'bot' | 'service_account' | 'deploy_token';
  skills: string[];
  assignedRepos: string[];
  projects: {
    id: string;
    name: string;
    role: string;
  }[];
  lastSynced: Date;
  isActive: boolean;

  // User Source & Sync Control
  userSource: 'gitlab' | 'manual';
  externalId?: string;
  canSyncFromGitlab: boolean;
  manuallyCreatedBy?: {
    userId: string;
    username: string;
    timestamp: Date;
  };

  // Category-level Sync Timestamps
  syncTimestamps?: {
    coreIdentity?: Date;
    profileSocial?: Date;
    permissionsStatus?: Date;
    namespace?: Date;
    groupMemberships?: Date;
    projectMemberships?: Date;
    groups?: Date;
    authoredMergeRequests?: Date;
    assignedMergeRequests?: Date;
    reviewRequestedMergeRequests?: Date;
    starredProjects?: Date;
    contributedProjects?: Date;
    snippets?: Date;
    savedReplies?: Date;
    timelogs?: Date;
    todos?: Date;
    emails?: Date;
    callouts?: Date;
    namespaceCommitEmails?: Date;
  };

  // Contact & Social Information
  skype?: string;
  linkedin?: string;
  twitter?: string;
  discord?: string;
  websiteUrl?: string;
  workInformation?: string;
  localTime?: string;
  birthday?: Date;
  hireDate?: Date;
  terminationDate?: Date;
  language?: string;
  theme?: string;
  bio?: string;
  location?: string;
  pronouns?: string;
  publicEmail?: string;
  webUrl?: string;

  // Activity Statistics
  groupCount?: number;
  projectCount?: number;
  contributionsCount?: number;
  discussionsCount?: number;
  issuesCreatedCount?: number;
  mergeRequestsCount?: number;
  commitsCount?: number;

  // Security & Access Control
  isSuperAdmin: boolean;
  twoFactorEnabled?: boolean;
  lockedAt?: Date;
  unlockAt?: Date;
  authenticationType?: string;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  
  // OTP Authentication
  otp?: string;
  otpExpiry?: Date;
  otpAttempts?: number;

  // Organization & Management
  manager?: {
    id: string;
    name: string;
    email?: string;
  };
  reportsTo?: {
    id: string;
    name: string;
    email?: string;
  };
  costCenter?: string;
  employeeNumber?: string;
  
  // User Settings & Preferences
  settings?: {
    notifications?: {
      email?: boolean;
      push?: boolean;
      inApp?: boolean;
      marketing?: boolean;
      updates?: boolean;
      teamActivity?: boolean;
      mentions?: boolean;
      reminders?: boolean;
      projectUpdates?: boolean;
      taskAssignments?: boolean;
      deadlineReminders?: boolean;
      desktop?: boolean;
    };
    display?: {
      theme?: string;
      density?: string;
      iconSize?: string;
      animations?: boolean;
      sounds?: boolean;
      showHelp?: boolean;
      dashboardLayout?: string;
      showCompleted?: boolean;
    };
    privacy?: {
      showOnlineStatus?: boolean;
      showActivity?: boolean;
      allowDataCollection?: boolean;
      shareUsageData?: boolean;
      showEmail?: boolean;
      publicProfile?: boolean;
      showActiveStatus?: boolean;
      shareAnalytics?: boolean;
    };
    integrations?: Array<{
      name: string;
      connected: boolean;
      lastSynced?: string;
    }>;
    dismissedNotifications?: string[];
  };
  
  // Instance methods
  updateSyncTimestamp(): Promise<IUser>;
  addProject(projectId: string, projectName: string, role: string): Promise<IUser>;
  removeProject(projectId: string): Promise<IUser>;
}

const UserSchema: Schema = new Schema({
  gitlabId: {
    type: Number,
    unique: true,
    sparse: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    index: true
  },
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true
  },
  role: {
    type: String,
    required: true,
    trim: true
  },
  accessRole: {
    type: String,
    enum: ACCESS_ROLE_VALUES,
    default: DEFAULT_ACCESS_ROLE,
    required: true,
    index: true
  },
  department: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  avatar: {
    type: String,
    trim: true
  },
  joinDate: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'on-leave'],
    default: 'active',
    index: true
  },
  userType: {
    type: String,
    enum: ['human', 'bot', 'service_account', 'deploy_token'],
    default: 'human',
    required: true,
    index: true
  },
  skills: [{
    type: String,
    trim: true
  }],
  assignedRepos: [{
    type: String,
    trim: true
  }],
  projects: [{
    id: {
      type: String,
      required: true
    },
    name: {
      type: String,
      required: true
    },
    role: {
      type: String,
      required: true
    }
  }],
  lastSynced: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  },

  // User Source & Sync Control
  userSource: {
    type: String,
    enum: ['gitlab', 'manual'],
    default: 'gitlab',
    required: true,
    index: true
  },
  externalId: {
    type: String,
    sparse: true,
    index: true
  },
  canSyncFromGitlab: {
    type: Boolean,
    default: true,
    index: true
  },
  manuallyCreatedBy: {
    userId: String,
    username: String,
    timestamp: Date
  },

  // Category-level Sync Timestamps
  syncTimestamps: {
    coreIdentity: Date,
    profileSocial: Date,
    permissionsStatus: Date,
    namespace: Date,
    groupMemberships: Date,
    projectMemberships: Date,
    groups: Date,
    authoredMergeRequests: Date,
    assignedMergeRequests: Date,
    reviewRequestedMergeRequests: Date,
    starredProjects: Date,
    contributedProjects: Date,
    snippets: Date,
    savedReplies: Date,
    timelogs: Date,
    todos: Date,
    emails: Date,
    callouts: Date,
    namespaceCommitEmails: Date
  },

  // Contact & Social Information
  skype: String,
  linkedin: String,
  twitter: String,
  discord: String,
  websiteUrl: String,
  workInformation: String,
  localTime: String,
  birthday: Date,
  hireDate: Date,
  terminationDate: Date,
  language: String,
  theme: String,
  bio: String,
  location: String,
  pronouns: String,
  publicEmail: String,
  webUrl: String,

  // Activity Statistics
  groupCount: { type: Number, min: 0 },
  projectCount: { type: Number, min: 0 },
  contributionsCount: { type: Number, min: 0 },
  discussionsCount: { type: Number, min: 0 },
  issuesCreatedCount: { type: Number, min: 0 },
  mergeRequestsCount: { type: Number, min: 0 },
  commitsCount: { type: Number, min: 0 },

  // Security & Access Control
  isSuperAdmin: {
    type: Boolean,
    default: false,
    index: true
  },
  twoFactorEnabled: Boolean,
  lockedAt: Date,
  unlockAt: Date,
  authenticationType: String,
  emailVerified: Boolean,
  phoneVerified: Boolean,
  
  // OTP Authentication
  otp: String,
  otpExpiry: Date,
  otpAttempts: { type: Number, default: 0 },

  // Organization & Management
  manager: {
    id: String,
    name: String,
    email: String
  },
  reportsTo: {
    id: String,
    name: String,
    email: String
  },
  costCenter: String,
  employeeNumber: String,

  // User Settings & Preferences
  settings: {
    notifications: {
      email: { type: Boolean, default: true },
      push: { type: Boolean, default: true },
      inApp: { type: Boolean, default: true },
      marketing: { type: Boolean, default: false },
      updates: { type: Boolean, default: true },
      teamActivity: { type: Boolean, default: true },
      mentions: { type: Boolean, default: true },
      reminders: { type: Boolean, default: true },
      projectUpdates: { type: Boolean, default: true },
      taskAssignments: { type: Boolean, default: true },
      deadlineReminders: { type: Boolean, default: true },
      desktop: { type: Boolean, default: true }
    },
    display: {
      theme: { type: String, default: 'system' },
      density: { type: String, default: 'comfortable' },
      iconSize: { type: String, default: 'medium' },
      animations: { type: Boolean, default: true },
      sounds: { type: Boolean, default: true },
      showHelp: { type: Boolean, default: true },
      dashboardLayout: { type: String, default: 'grid' },
      showCompleted: { type: Boolean, default: true }
    },
    privacy: {
      showOnlineStatus: { type: Boolean, default: true },
      showActivity: { type: Boolean, default: true },
      allowDataCollection: { type: Boolean, default: true },
      shareUsageData: { type: Boolean, default: false },
      showEmail: { type: Boolean, default: true },
      publicProfile: { type: Boolean, default: true },
      showActiveStatus: { type: Boolean, default: true },
      shareAnalytics: { type: Boolean, default: false }
    },
    integrations: [{
      name: String,
      connected: { type: Boolean, default: false },
      lastSynced: String
    }],
    dismissedNotifications: [{ type: String }]
  }
}, {
  timestamps: true,
  collection: 'users'
});

// Indexes for better query performance
UserSchema.index({ email: 1 });
UserSchema.index({ username: 1 });
UserSchema.index({ department: 1 });
UserSchema.index({ status: 1 });
UserSchema.index({ userType: 1 });
UserSchema.index({ 'projects.id': 1 });
UserSchema.index({ skills: 1 });
UserSchema.index({ lastSynced: 1 });
UserSchema.index({ userSource: 1, email: 1 });
UserSchema.index({ userSource: 1, status: 1 });
UserSchema.index({ canSyncFromGitlab: 1 });
UserSchema.index({ department: 1, userType: 1 });
UserSchema.index({ accessRole: 1, department: 1 });
UserSchema.index({ isSuperAdmin: 1 });

// Virtual for full name
UserSchema.virtual('fullName').get(function() {
  return this.name;
});

// Static method to find by GitLab ID
UserSchema.statics.findByGitlabId = function(gitlabId: number) {
  return this.findOne({ gitlabId }).lean();
};

// Static method to find by email
UserSchema.statics.findByEmail = function(email: string) {
  return this.findOne({ email: email.toLowerCase() }).lean();
};

// Static method to find by department
UserSchema.statics.findByDepartment = function(department: string) {
  return this.find({ department, isActive: true }).lean();
};

// Instance method to update sync timestamp
UserSchema.methods.updateSyncTimestamp = function() {
  this.lastSynced = new Date();
  return this.save();
};

// Instance method to add project assignment
UserSchema.methods.addProject = function(projectId: string, projectName: string, role: string) {
  const existingProject = this.projects.find((p: { id: string; name: string; role: string }) => p.id === projectId);
  if (!existingProject) {
    this.projects.push({ id: projectId, name: projectName, role });
    return this.save();
  }
  return this;
};

// Instance method to remove project assignment
UserSchema.methods.removeProject = function(projectId: string) {
  this.projects = this.projects.filter((p: { id: string; name: string; role: string }) => p.id !== projectId);
  return this.save();
};

export const User = mongoose.model<IUser, IUserModel>('User', UserSchema);
