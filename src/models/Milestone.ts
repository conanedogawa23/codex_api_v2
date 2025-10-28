import mongoose, { Schema, Document } from 'mongoose';

export interface IMilestone extends Document {
  gitlabId: number;
  projectId: string;
  iid: number;
  title: string;
  description?: string;
  state: 'active' | 'closed';
  dueDate?: Date;
  startDate?: Date;
  webUrl: string;
  issueIds: mongoose.Types.ObjectId[];
  mergeRequestIds: mongoose.Types.ObjectId[];
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  lastSyncedAt: Date;
  isDeleted: boolean;

  // Category-level Sync Timestamps
  syncTimestamps?: {
    coreData?: Date;
    issues?: Date;
    mergeRequests?: Date;
    statistics?: Date;
  };
}

const MilestoneSchema: Schema = new Schema({
  gitlabId: {
    type: Number,
    required: true,
    unique: true,
    index: true
  },
  projectId: {
    type: String,
    ref: 'Project',
    required: true,
    index: true
  },
  iid: {
    type: Number,
    required: true
  },
  title: {
    type: String,
    required: true,
    index: true
  },
  description: {
    type: String,
    default: ''
  },
  state: {
    type: String,
    enum: ['active', 'closed'],
    default: 'active',
    index: true
  },
  dueDate: {
    type: Date,
    index: true
  },
  startDate: {
    type: Date
  },
  webUrl: {
    type: String,
    required: true
  },
  issueIds: [{
    type: Schema.Types.ObjectId,
    ref: 'Issue'
  }],
  mergeRequestIds: [{
    type: Schema.Types.ObjectId,
    ref: 'MergeRequest'
  }],
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  lastSyncedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  isDeleted: {
    type: Boolean,
    default: false,
    index: true
  },

  // Category-level Sync Timestamps
  syncTimestamps: {
    coreData: Date,
    issues: Date,
    mergeRequests: Date,
    statistics: Date
  }
}, {
  timestamps: true,
  collection: 'milestones'
});

// Indexes for common queries
MilestoneSchema.index({ projectId: 1, state: 1 });
MilestoneSchema.index({ projectId: 1, iid: 1 }, { unique: true });
MilestoneSchema.index({ dueDate: 1, state: 1 });
MilestoneSchema.index({ lastSyncedAt: 1, isDeleted: 1 });

// Virtuals
MilestoneSchema.virtual('issueCount').get(function(this: IMilestone) {
  return this.issueIds.length;
});

MilestoneSchema.virtual('mergeRequestCount').get(function(this: IMilestone) {
  return this.mergeRequestIds.length;
});

MilestoneSchema.virtual('isOverdue').get(function(this: IMilestone) {
  if (!this.dueDate || this.state === 'closed') return false;
  return new Date() > this.dueDate;
});

// Instance methods
MilestoneSchema.methods.close = function(this: IMilestone) {
  this.state = 'closed';
  return this.save();
};

MilestoneSchema.methods.reopen = function(this: IMilestone) {
  this.state = 'active';
  return this.save();
};

MilestoneSchema.methods.markAsDeleted = function(this: IMilestone) {
  this.isDeleted = true;
  return this.save();
};

export const Milestone = mongoose.model<IMilestone>('Milestone', MilestoneSchema);
