import mongoose, { Document, Schema } from 'mongoose';

// Static method interfaces
interface IProjectModel extends mongoose.Model<IProject> {
  findByGitlabId(gitlabId: number): Promise<IProject | null>;
  findByDepartment(department: string): Promise<IProject[]>;
  findByStatus(status: string): Promise<IProject[]>;
  findOverdue(): Promise<IProject[]>;
}

export interface IProject extends Document {
  gitlabId: number;
  name: string;
  nameWithNamespace: string;
  description?: string;
  defaultBranch: string;
  visibility: 'private' | 'internal' | 'public';
  webUrl: string;
  httpUrlToRepo: string;
  sshUrlToRepo: string;
  pathWithNamespace: string;
  namespace: {
    id: number;
    name: string;
    path: string;
    kind: string;
  };
  // Enhanced fields for project management
  status: 'planned' | 'active' | 'completed' | 'on-hold' | 'cancelled';
  progress: number; // 0-100 percentage
  priority: 'low' | 'medium' | 'high' | 'urgent';
  category: string;
  department?: string;
  deadline?: Date;
  assignedTo: {
    id: string;
    name: string;
    role: string;
    department: string;
  }[];
  tasks: {
    total: number;
    completed: number;
    inProgress: number;
    pending: number;
  };
  budget?: {
    allocated: number;
    spent: number;
    currency: string;
  };
  createdAt: Date;
  updatedAt: Date;
  lastActivityAt: Date;
  lastSynced: Date;
  isActive: boolean;
  
  // Instance methods
  updateSyncTimestamp(): Promise<IProject>;
  updateProgress(progress: number): Promise<IProject>;
  updateTaskSummary(taskSummary: { total: number; completed: number; inProgress: number; pending: number }): Promise<IProject>;
  assignUser(userId: string, userName: string, role: string, department: string): Promise<IProject>;
  unassignUser(userId: string): Promise<IProject>;
}

const ProjectSchema: Schema = new Schema({
  gitlabId: {
    type: Number,
    required: true,
    unique: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  nameWithNamespace: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  defaultBranch: {
    type: String,
    default: 'main'
  },
  visibility: {
    type: String,
    enum: ['private', 'internal', 'public'],
    default: 'private'
  },
  webUrl: {
    type: String,
    required: true
  },
  httpUrlToRepo: {
    type: String,
    required: true
  },
  sshUrlToRepo: {
    type: String,
    required: true
  },
  pathWithNamespace: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  namespace: {
    id: {
      type: Number,
      required: true
    },
    name: {
      type: String,
      required: true
    },
    path: {
      type: String,
      required: true
    },
    kind: {
      type: String,
      required: true
    }
  },
  // Enhanced fields for project management
  status: {
    type: String,
    enum: ['planned', 'active', 'completed', 'on-hold', 'cancelled'],
    default: 'planned',
    index: true
  },
  progress: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium',
    index: true
  },
  category: {
    type: String,
    trim: true,
    index: true
  },
  department: {
    type: String,
    trim: true,
    index: true
  },
  deadline: {
    type: Date,
    index: true
  },
  assignedTo: [{
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
    },
    department: {
      type: String,
      required: true
    }
  }],
  tasks: {
    total: {
      type: Number,
      default: 0
    },
    completed: {
      type: Number,
      default: 0
    },
    inProgress: {
      type: Number,
      default: 0
    },
    pending: {
      type: Number,
      default: 0
    }
  },
  budget: {
    allocated: {
      type: Number,
      min: 0
    },
    spent: {
      type: Number,
      min: 0,
      default: 0
    },
    currency: {
      type: String,
      default: 'USD'
    }
  },
  createdAt: {
    type: Date,
    required: true
  },
  updatedAt: {
    type: Date,
    required: true
  },
  lastActivityAt: {
    type: Date,
    required: true
  },
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
  collection: 'projects'
});

// Indexes for better query performance
ProjectSchema.index({ gitlabId: 1 });
ProjectSchema.index({ pathWithNamespace: 1 });
ProjectSchema.index({ 'namespace.id': 1 });
ProjectSchema.index({ lastSynced: 1 });
ProjectSchema.index({ isActive: 1 });
ProjectSchema.index({ status: 1 });
ProjectSchema.index({ priority: 1 });
ProjectSchema.index({ category: 1 });
ProjectSchema.index({ department: 1 });
ProjectSchema.index({ deadline: 1 });
ProjectSchema.index({ 'assignedTo.id': 1 });

// Virtual for URL-safe project path
ProjectSchema.virtual('urlPath').get(function() {
  return this.pathWithNamespace.replace('/', '%2F');
});

// Static method to find by GitLab ID
ProjectSchema.statics.findByGitlabId = function(gitlabId: number) {
  return this.findOne({ gitlabId });
};

// Instance method to update sync timestamp
ProjectSchema.methods.updateSyncTimestamp = function() {
  this.lastSynced = new Date();
  return this.save();
};

// Instance method to update progress
ProjectSchema.methods.updateProgress = function(progress: number) {
  this.progress = Math.max(0, Math.min(100, progress));
  if (progress >= 100) {
    this.status = 'completed';
  } else if (progress > 0 && this.status === 'planned') {
    this.status = 'active';
  }
  return this.save();
};

// Instance method to update task summary
ProjectSchema.methods.updateTaskSummary = function(taskSummary: { total: number; completed: number; inProgress: number; pending: number }) {
  this.tasks = taskSummary;
  const progressPercentage = taskSummary.total > 0 ? Math.round((taskSummary.completed / taskSummary.total) * 100) : 0;
  this.updateProgress(progressPercentage);
  return this.save();
};

// Instance method to assign user
ProjectSchema.methods.assignUser = function(userId: string, userName: string, role: string, department: string) {
  const existingAssignment = this.assignedTo.find((assignment: any) => assignment.id === userId);
  if (!existingAssignment) {
    this.assignedTo.push({ id: userId, name: userName, role, department });
    return this.save();
  }
  return this;
};

// Instance method to unassign user
ProjectSchema.methods.unassignUser = function(userId: string) {
  this.assignedTo = this.assignedTo.filter((assignment: any) => assignment.id !== userId);
  return this.save();
};

// Static method to find by department
ProjectSchema.statics.findByDepartment = function(department: string) {
  return this.find({ department, isActive: true });
};

// Static method to find by status
ProjectSchema.statics.findByStatus = function(status: string) {
  return this.find({ status, isActive: true });
};

// Static method to find overdue projects
ProjectSchema.statics.findOverdue = function() {
  return this.find({
    deadline: { $lt: new Date() },
    status: { $nin: ['completed', 'cancelled'] },
    isActive: true
  });
};

export const Project = mongoose.model<IProject, IProjectModel>('Project', ProjectSchema);
