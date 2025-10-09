import mongoose, { Document, Schema } from 'mongoose';

// Static method interfaces
interface IUserModel extends mongoose.Model<IUser> {
  findByGitlabId(gitlabId: number): Promise<IUser | null>;
  findByEmail(email: string): Promise<IUser | null>;
  findByDepartment(department: string): Promise<IUser[]>;
}

export interface IUser extends Document {
  gitlabId?: number;
  name: string;
  email: string;
  username: string;
  role: string;
  department: string;
  avatar?: string;
  joinDate: Date;
  status: 'active' | 'inactive' | 'on-leave';
  skills: string[];
  assignedRepos: string[];
  projects: {
    id: string;
    name: string;
    role: string;
  }[];
  lastSynced: Date;
  isActive: boolean;
  
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
UserSchema.index({ 'projects.id': 1 });
UserSchema.index({ skills: 1 });
UserSchema.index({ lastSynced: 1 });

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
