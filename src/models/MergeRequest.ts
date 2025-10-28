import mongoose, { Document, Schema } from 'mongoose';

// Static method interfaces
interface IMergeRequestModel extends mongoose.Model<IMergeRequest> {
  findByGitlabId(gitlabId: number): Promise<IMergeRequest | null>;
}

export interface IMergeRequest extends Document {
  gitlabId: number;
  iid: number;
  projectId: number;
  title: string;
  description?: string;
  state: 'opened' | 'closed' | 'locked' | 'merged';
  mergeStatus: 'can_be_merged' | 'cannot_be_merged' | 'unchecked';
  sourceBranch: string;
  targetBranch: string;
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
  reviewers: {
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
  mergedAt?: Date;
  closedAt?: Date;
  firstDeployedToProductionAt?: Date;
  lastSynced: Date;
  isActive: boolean;

  // Category-level Sync Timestamps
  syncTimestamps?: {
    coreData?: Date;
    reviewersAssignees?: Date;
    approvals?: Date;
    pipelines?: Date;
    diffStats?: Date;
    discussions?: Date;
    commits?: Date;
    changes?: Date;
  };
}

const MergeRequestSchema: Schema = new Schema({
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
    enum: ['opened', 'closed', 'locked', 'merged'],
    default: 'opened',
    index: true
  },
  mergeStatus: {
    type: String,
    enum: ['can_be_merged', 'cannot_be_merged', 'unchecked'],
    default: 'unchecked'
  },
  sourceBranch: {
    type: String,
    required: true,
    index: true
  },
  targetBranch: {
    type: String,
    required: true,
    index: true
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
  reviewers: [{
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
  mergedAt: Date,
  closedAt: Date,
  firstDeployedToProductionAt: Date,
  lastSynced: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  },

  // Category-level Sync Timestamps
  syncTimestamps: {
    coreData: Date,
    reviewersAssignees: Date,
    approvals: Date,
    pipelines: Date,
    diffStats: Date,
    discussions: Date,
    commits: Date,
    changes: Date
  }
}, {
  timestamps: true,
  collection: 'merge_requests'
});

// Compound indexes for better query performance
MergeRequestSchema.index({ projectId: 1, iid: 1 }, { unique: true });
MergeRequestSchema.index({ projectId: 1, state: 1 });
MergeRequestSchema.index({ projectId: 1, sourceBranch: 1 });
MergeRequestSchema.index({ projectId: 1, targetBranch: 1 });
MergeRequestSchema.index({ 'author.id': 1 });
MergeRequestSchema.index({ 'assignees.id': 1 });
MergeRequestSchema.index({ 'reviewers.id': 1 });
MergeRequestSchema.index({ labels: 1 });
MergeRequestSchema.index({ lastSynced: 1 });

// Static method to find by project and IID
MergeRequestSchema.statics.findByProjectAndIid = function(projectId: number, iid: number) {
  return this.findOne({ projectId, iid }).lean();
};

// Static method to find by GitLab ID
MergeRequestSchema.statics.findByGitlabId = function(gitlabId: number) {
  return this.findOne({ gitlabId }).lean();
};

// Instance method to update sync timestamp
MergeRequestSchema.methods.updateSyncTimestamp = function() {
  this.lastSynced = new Date();
  return this.save();
};

export const MergeRequest = mongoose.model<IMergeRequest, IMergeRequestModel>('MergeRequest', MergeRequestSchema);
