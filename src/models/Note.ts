import mongoose, { Schema, Document } from 'mongoose';

export interface INote extends Document {
  gitlabId: number;
  discussionId?: mongoose.Types.ObjectId;
  projectId: string;
  noteableType: 'Issue' | 'MergeRequest' | 'Commit';
  noteableId: mongoose.Types.ObjectId | string;
  body: string;
  authorId: mongoose.Types.ObjectId;
  system: boolean;
  resolvable: boolean;
  resolved?: boolean;
  resolvedBy?: mongoose.Types.ObjectId;
  resolvedAt?: Date;
  confidential: boolean;
  internal: boolean;
  type?: string;
  position?: any;
  createdAt: Date;
  updatedAt: Date;
  lastSyncedAt: Date;
  isDeleted: boolean;
}

const NoteSchema: Schema = new Schema({
  gitlabId: {
    type: Number,
    required: true,
    unique: true,
    index: true
  },
  discussionId: {
    type: Schema.Types.ObjectId,
    ref: 'Discussion',
    index: true
  },
  projectId: {
    type: String,
    ref: 'Project',
    required: true,
    index: true
  },
  noteableType: {
    type: String,
    enum: ['Issue', 'MergeRequest', 'Commit'],
    required: true,
    index: true
  },
  noteableId: {
    type: Schema.Types.Mixed,
    required: true,
    index: true
  },
  body: {
    type: String,
    required: true
  },
  authorId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  system: {
    type: Boolean,
    default: false,
    index: true
  },
  resolvable: {
    type: Boolean,
    default: false
  },
  resolved: {
    type: Boolean,
    default: false,
    index: true
  },
  resolvedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  resolvedAt: {
    type: Date
  },
  confidential: {
    type: Boolean,
    default: false
  },
  internal: {
    type: Boolean,
    default: false
  },
  type: {
    type: String
  },
  position: {
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
  timestamps: true,
  collection: 'notes'
});

// Indexes for common queries
NoteSchema.index({ noteableType: 1, noteableId: 1, createdAt: -1 });
NoteSchema.index({ projectId: 1, authorId: 1 });
NoteSchema.index({ discussionId: 1, createdAt: 1 });
NoteSchema.index({ lastSyncedAt: 1, isDeleted: 1 });

// Instance methods
NoteSchema.methods.resolve = function(this: INote, userId: mongoose.Types.ObjectId) {
  this.resolved = true;
  this.resolvedBy = userId;
  this.resolvedAt = new Date();
  return this.save();
};

NoteSchema.methods.unresolve = function(this: INote) {
  this.resolved = false;
  this.resolvedBy = undefined;
  this.resolvedAt = undefined;
  return this.save();
};

NoteSchema.methods.markAsDeleted = function(this: INote) {
  this.isDeleted = true;
  return this.save();
};

export const Note = mongoose.model<INote>('Note', NoteSchema);
