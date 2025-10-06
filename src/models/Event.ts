import mongoose, { Schema, Document } from 'mongoose';

export interface IEvent extends Document {
  gitlabId: number;
  projectId?: string;
  authorId?: mongoose.Types.ObjectId;
  actionName: string;
  targetType?: string;
  targetId?: number;
  targetTitle?: string;
  createdAt: Date;
  pushData?: {
    commitCount: number;
    action: string;
    refType: string;
    commitFrom?: string;
    commitTo?: string;
    ref?: string;
    commitTitle?: string;
  };
  note?: Record<string, unknown>;
  lastSyncedAt: Date;
  isDeleted: boolean;
}

const EventSchema: Schema = new Schema({
  gitlabId: {
    type: Number,
    required: true,
    unique: true,
    index: true
  },
  projectId: {
    type: String,
    ref: 'Project',
    index: true
  },
  authorId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  actionName: {
    type: String,
    required: true,
    index: true
  },
  targetType: {
    type: String,
    index: true
  },
  targetId: {
    type: Number
  },
  targetTitle: {
    type: String
  },
  pushData: {
    commitCount: Number,
    action: String,
    refType: String,
    commitFrom: String,
    commitTo: String,
    ref: String,
    commitTitle: String
  },
  note: {
    type: Schema.Types.Mixed
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
  collection: 'events'
});

// Indexes for common queries
EventSchema.index({ projectId: 1, createdAt: -1 });
EventSchema.index({ authorId: 1, createdAt: -1 });
EventSchema.index({ actionName: 1, createdAt: -1 });
EventSchema.index({ targetType: 1, targetId: 1 });
EventSchema.index({ lastSyncedAt: 1, isDeleted: 1 });

// Virtuals
EventSchema.virtual('isPushEvent').get(function(this: IEvent) {
  return this.actionName === 'pushed';
});

// Instance methods
EventSchema.methods.markAsDeleted = function(this: IEvent) {
  this.isDeleted = true;
  return this.save();
};

export const Event = mongoose.model<IEvent>('Event', EventSchema);
