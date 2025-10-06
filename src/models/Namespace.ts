import mongoose, { Schema, Document } from 'mongoose';

export interface INamespace extends Document {
  gitlabId: number;
  name: string;
  path: string;
  kind: 'user' | 'group';
  fullName: string;
  fullPath: string;
  parentId?: number;
  avatarUrl?: string;
  webUrl: string;
  membersCountWithDescendants?: number;
  billableMembersCount?: number;
  maxSeatsUsed?: number;
  seatsInUse?: number;
  planName?: string;
  trialEndsOn?: Date;
  trial?: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastSyncedAt: Date;
  isDeleted: boolean;
}

const NamespaceSchema: Schema = new Schema({
  gitlabId: {
    type: Number,
    required: true,
    unique: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    index: true
  },
  path: {
    type: String,
    required: true,
    index: true
  },
  kind: {
    type: String,
    enum: ['user', 'group'],
    required: true,
    index: true
  },
  fullName: {
    type: String,
    required: true
  },
  fullPath: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  parentId: {
    type: Number,
    index: true
  },
  avatarUrl: {
    type: String
  },
  webUrl: {
    type: String,
    required: true
  },
  membersCountWithDescendants: {
    type: Number,
    min: 0
  },
  billableMembersCount: {
    type: Number,
    min: 0
  },
  maxSeatsUsed: {
    type: Number,
    min: 0
  },
  seatsInUse: {
    type: Number,
    min: 0
  },
  planName: {
    type: String
  },
  trialEndsOn: {
    type: Date
  },
  trial: {
    type: Boolean,
    default: false
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
  timestamps: true,
  collection: 'namespaces'
});

// Indexes for common queries
NamespaceSchema.index({ kind: 1, isDeleted: 1 });
NamespaceSchema.index({ parentId: 1 });
NamespaceSchema.index({ lastSyncedAt: 1, isDeleted: 1 });

// Virtuals
NamespaceSchema.virtual('isGroup').get(function(this: INamespace) {
  return this.kind === 'group';
});

NamespaceSchema.virtual('isUser').get(function(this: INamespace) {
  return this.kind === 'user';
});

// Instance methods
NamespaceSchema.methods.markAsDeleted = function(this: INamespace) {
  this.isDeleted = true;
  return this.save();
};

export const Namespace = mongoose.model<INamespace>('Namespace', NamespaceSchema);
