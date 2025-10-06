import mongoose, { Schema, Document } from 'mongoose';

export interface IPipelineJob extends Document {
  gitlabId: number;
  pipelineId: mongoose.Types.ObjectId;
  projectId: string;
  name: string;
  stage: string;
  status: 'created' | 'pending' | 'running' | 'success' | 'failed' | 'canceled' | 'skipped' | 'manual' | 'waiting_for_resource' | 'preparing';
  ref: string;
  tag: boolean;
  coverage?: number;
  allowFailure: boolean;
  duration?: number;
  queuedDuration?: number;
  webUrl: string;
  userId?: mongoose.Types.ObjectId;
  runnerId?: number;
  runnerDescription?: string;
  createdAt: Date;
  startedAt?: Date;
  finishedAt?: Date;
  erasedAt?: Date;
  artifactsExpireAt?: Date;
  lastSyncedAt: Date;
  isDeleted: boolean;
}

const PipelineJobSchema: Schema = new Schema({
  gitlabId: {
    type: Number,
    required: true,
    unique: true,
    index: true
  },
  pipelineId: {
    type: Schema.Types.ObjectId,
    ref: 'Pipeline',
    required: true,
    index: true
  },
  projectId: {
    type: String,
    ref: 'Project',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    index: true
  },
  stage: {
    type: String,
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['created', 'pending', 'running', 'success', 'failed', 'canceled', 'skipped', 'manual', 'waiting_for_resource', 'preparing'],
    required: true,
    index: true
  },
  ref: {
    type: String,
    required: true
  },
  tag: {
    type: Boolean,
    default: false
  },
  coverage: {
    type: Number,
    min: 0,
    max: 100
  },
  allowFailure: {
    type: Boolean,
    default: false
  },
  duration: {
    type: Number,
    min: 0
  },
  queuedDuration: {
    type: Number,
    min: 0
  },
  webUrl: {
    type: String,
    required: true
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  runnerId: {
    type: Number
  },
  runnerDescription: {
    type: String
  },
  startedAt: {
    type: Date
  },
  finishedAt: {
    type: Date
  },
  erasedAt: {
    type: Date
  },
  artifactsExpireAt: {
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
  }
}, {
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'pipeline_jobs'
});

// Indexes for common queries
PipelineJobSchema.index({ pipelineId: 1, stage: 1 });
PipelineJobSchema.index({ projectId: 1, status: 1 });
PipelineJobSchema.index({ projectId: 1, name: 1 });
PipelineJobSchema.index({ lastSyncedAt: 1, isDeleted: 1 });

// Virtuals
PipelineJobSchema.virtual('isRunning').get(function(this: IPipelineJob) {
  return ['created', 'pending', 'running', 'waiting_for_resource', 'preparing'].includes(this.status);
});

PipelineJobSchema.virtual('isComplete').get(function(this: IPipelineJob) {
  return ['success', 'failed', 'canceled', 'skipped'].includes(this.status);
});

// Instance methods
PipelineJobSchema.methods.markAsDeleted = function(this: IPipelineJob) {
  this.isDeleted = true;
  return this.save();
};

export const PipelineJob = mongoose.model<IPipelineJob>('PipelineJob', PipelineJobSchema);
