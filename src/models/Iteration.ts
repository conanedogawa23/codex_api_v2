import mongoose, { Schema, Document } from 'mongoose';

export interface IIteration extends Document {
  gitlabId: number;
  groupId: number;
  iid: number;
  sequence: number;
  title: string;
  description?: string;
  state: 'upcoming' | 'current' | 'opened' | 'closed';
  webUrl: string;
  startDate: Date;
  dueDate: Date;
  createdAt: Date;
  updatedAt: Date;
  lastSyncedAt: Date;
  isDeleted: boolean;

  // Category-level Sync Timestamps
  syncTimestamps?: {
    coreData?: Date;
    issues?: Date;
  };
}

const IterationSchema: Schema = new Schema({
  gitlabId: {
    type: Number,
    required: true,
    unique: true,
    index: true
  },
  groupId: {
    type: Number,
    required: true,
    index: true
  },
  iid: {
    type: Number,
    required: true
  },
  sequence: {
    type: Number,
    required: true
  },
  title: {
    type: String,
    required: true,
    index: true
  },
  description: {
    type: String
  },
  state: {
    type: String,
    enum: ['upcoming', 'current', 'opened', 'closed'],
    required: true,
    index: true
  },
  webUrl: {
    type: String,
    required: true
  },
  startDate: {
    type: Date,
    required: true,
    index: true
  },
  dueDate: {
    type: Date,
    required: true,
    index: true
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
    issues: Date
  }
}, {
  timestamps: true,
  collection: 'iterations'
});

// Indexes for common queries
IterationSchema.index({ groupId: 1, state: 1 });
IterationSchema.index({ groupId: 1, iid: 1 }, { unique: true });
IterationSchema.index({ startDate: 1, dueDate: 1 });
IterationSchema.index({ lastSyncedAt: 1, isDeleted: 1 });

// Virtuals
IterationSchema.virtual('duration').get(function(this: IIteration) {
  return Math.ceil((this.dueDate.getTime() - this.startDate.getTime()) / (1000 * 60 * 60 * 24));
});

IterationSchema.virtual('isActive').get(function(this: IIteration) {
  const now = new Date();
  return this.startDate <= now && now <= this.dueDate && this.state !== 'closed';
});

// Instance methods
IterationSchema.methods.markAsDeleted = function(this: IIteration) {
  this.isDeleted = true;
  return this.save();
};

export const Iteration = mongoose.model<IIteration>('Iteration', IterationSchema);
