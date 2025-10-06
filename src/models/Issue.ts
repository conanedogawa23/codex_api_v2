import mongoose, { Document, Schema } from 'mongoose';

export interface IIssue extends Document {
  gitlabId: number;
  iid: number;
  projectId: number;
  title: string;
  description?: string;
  state: 'opened' | 'closed';
  // Enhanced fields for issue management
  priority: 'low' | 'medium' | 'high' | 'urgent';
  completionPercentage: number;
  tags: string[];
  estimatedHours?: number;
  actualHours?: number;
  labels: string[];
  milestone?: {
    id: number;
    title: string;
    description?: string;
    state: 'active' | 'closed';
    dueDate?: Date;
  };
  assignees: {
    id: number;
    name: string;
    username: string;
    email?: string;
    avatarUrl?: string;
  }[];
  author: {
    id: number;
    name: string;
    username: string;
    email?: string;
    avatarUrl?: string;
  };
  webUrl: string;
  createdAt: Date;
  updatedAt: Date;
  closedAt?: Date;
  dueDate?: Date;
  lastSynced: Date;
  isActive: boolean;
  
  // Instance methods
  updateSyncTimestamp(): Promise<IIssue>;
  updateProgress(percentage: number): Promise<IIssue>;
  addTag(tag: string): Promise<IIssue>;
  removeTag(tag: string): Promise<IIssue>;
}

const IssueSchema: Schema = new Schema({
  gitlabId: {
    type: Number,
    required: true,
    unique: true,
    index: true
  },
  iid: {
    type: Number,
    required: true
  },
  projectId: {
    type: Number,
    required: true,
    index: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  state: {
    type: String,
    enum: ['opened', 'closed'],
    default: 'opened',
    index: true
  },
  // Enhanced fields for issue management
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium',
    index: true
  },
  completionPercentage: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  tags: [{
    type: String,
    trim: true
  }],
  estimatedHours: {
    type: Number,
    min: 0
  },
  actualHours: {
    type: Number,
    min: 0
  },
  labels: [{
    type: String,
    trim: true
  }],
  milestone: {
    id: Number,
    title: String,
    description: String,
    state: {
      type: String,
      enum: ['active', 'closed']
    },
    dueDate: Date
  },
  assignees: [{
    id: {
      type: Number,
      required: true
    },
    name: {
      type: String,
      required: true
    },
    username: {
      type: String,
      required: true
    },
    email: String,
    avatarUrl: String
  }],
  author: {
    id: {
      type: Number,
      required: true
    },
    name: {
      type: String,
      required: true
    },
    username: {
      type: String,
      required: true
    },
    email: String,
    avatarUrl: String
  },
  webUrl: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    required: true
  },
  updatedAt: {
    type: Date,
    required: true
  },
  closedAt: Date,
  dueDate: Date,
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
  collection: 'issues'
});

// Compound indexes for better query performance
IssueSchema.index({ projectId: 1, iid: 1 }, { unique: true });
IssueSchema.index({ projectId: 1, state: 1 });
IssueSchema.index({ 'author.id': 1 });
IssueSchema.index({ 'assignees.id': 1 });
IssueSchema.index({ labels: 1 });
IssueSchema.index({ tags: 1 });
IssueSchema.index({ priority: 1 });
IssueSchema.index({ priority: 1, dueDate: 1 });
IssueSchema.index({ lastSynced: 1 });

// Static method to find by project and IID
IssueSchema.statics.findByProjectAndIid = function(projectId: number, iid: number) {
  return this.findOne({ projectId, iid });
};

// Static method to find by GitLab ID
IssueSchema.statics.findByGitlabId = function(gitlabId: number) {
  return this.findOne({ gitlabId });
};

// Instance method to update sync timestamp
IssueSchema.methods.updateSyncTimestamp = function() {
  this.lastSynced = new Date();
  return this.save();
};

// Instance method to update completion percentage
IssueSchema.methods.updateProgress = function(percentage: number) {
  this.completionPercentage = Math.max(0, Math.min(100, percentage));
  if (percentage >= 100) {
    this.state = 'closed';
    this.closedAt = new Date();
  }
  return this.save();
};

// Instance method to add tag
IssueSchema.methods.addTag = function(tag: string) {
  if (!this.tags.includes(tag)) {
    this.tags.push(tag);
    return this.save();
  }
  return this;
};

// Instance method to remove tag
IssueSchema.methods.removeTag = function(tag: string) {
  this.tags = this.tags.filter((t: string) => t !== tag);
  return this.save();
};

// Static method to find by priority
IssueSchema.statics.findByPriority = function(priority: string) {
  return this.find({ priority, isActive: true });
};

// Static method to find overdue issues
IssueSchema.statics.findOverdue = function() {
  return this.find({
    dueDate: { $lt: new Date() },
    state: 'opened',
    isActive: true
  });
};

export const Issue = mongoose.model<IIssue>('Issue', IssueSchema);
