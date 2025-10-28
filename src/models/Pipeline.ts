import mongoose, { Schema, Document } from 'mongoose';

export interface IPipeline extends Document {
  gitlabId: number;
  projectId: string;
  ref: string;
  sha: string;
  status: 'created' | 'waiting_for_resource' | 'preparing' | 'pending' | 'running' | 'success' | 'failed' | 'canceled' | 'skipped' | 'manual' | 'scheduled';
  source: string;
  beforeSha?: string;
  tag: boolean;
  webUrl: string;
  duration?: number;
  queuedDuration?: number;
  coverage?: number;
  userId?: mongoose.Types.ObjectId;
  jobIds: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date;
  finishedAt?: Date;
  committedAt?: Date;
  lastSyncedAt: Date;
  isDeleted: boolean;

  // Category-level Sync Timestamps
  syncTimestamps?: {
    coreData?: Date;
    jobs?: Date;
    testReports?: Date;
    variables?: Date;
    artifacts?: Date;
  };
}

const PipelineSchema: Schema = new Schema({
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
  ref: {
    type: String,
    required: true,
    index: true
  },
  sha: {
    type: String,
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['created', 'waiting_for_resource', 'preparing', 'pending', 'running', 'success', 'failed', 'canceled', 'skipped', 'manual', 'scheduled'],
    required: true,
    index: true
  },
  source: {
    type: String,
    required: true
  },
  beforeSha: {
    type: String
  },
  tag: {
    type: Boolean,
    default: false,
    index: true
  },
  webUrl: {
    type: String,
    required: true
  },
  duration: {
    type: Number,
    min: 0
  },
  queuedDuration: {
    type: Number,
    min: 0
  },
  coverage: {
    type: Number,
    min: 0,
    max: 100
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  jobIds: [{
    type: Schema.Types.ObjectId,
    ref: 'PipelineJob'
  }],
  startedAt: {
    type: Date,
    index: true
  },
  finishedAt: {
    type: Date
  },
  committedAt: {
    type: Date
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
    jobs: Date,
    testReports: Date,
    variables: Date,
    artifacts: Date
  }
}, {
  timestamps: true,
  collection: 'pipelines'
});

// Indexes for common queries
PipelineSchema.index({ projectId: 1, status: 1 });
PipelineSchema.index({ projectId: 1, ref: 1, createdAt: -1 });
PipelineSchema.index({ sha: 1, projectId: 1 });
PipelineSchema.index({ createdAt: -1 });
PipelineSchema.index({ lastSyncedAt: 1, isDeleted: 1 });

// Virtuals
PipelineSchema.virtual('isRunning').get(function(this: IPipeline) {
  return ['created', 'waiting_for_resource', 'preparing', 'pending', 'running'].includes(this.status);
});

PipelineSchema.virtual('isComplete').get(function(this: IPipeline) {
  return ['success', 'failed', 'canceled', 'skipped'].includes(this.status);
});

PipelineSchema.virtual('jobCount').get(function(this: IPipeline) {
  return this.jobIds.length;
});

// Instance methods
PipelineSchema.methods.markAsDeleted = function(this: IPipeline) {
  this.isDeleted = true;
  return this.save();
};

export const Pipeline = mongoose.model<IPipeline>('Pipeline', PipelineSchema);
