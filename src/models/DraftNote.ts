import mongoose, { Schema, Document } from 'mongoose';

export interface IDraftNote extends Document {
  gitlabId: number;
  projectId: string;
  mergeRequestId: mongoose.Types.ObjectId;
  authorId: mongoose.Types.ObjectId;
  note: string;
  position?: Record<string, unknown>;
  lineCode?: string;
  resolveDiscussion?: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastSyncedAt: Date;
  isDeleted: boolean;
}

const DraftNoteSchema: Schema = new Schema({
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
  mergeRequestId: {
    type: Schema.Types.ObjectId,
    ref: 'MergeRequest',
    required: true,
    index: true
  },
  authorId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  note: {
    type: String,
    required: true
  },
  position: {
    type: Schema.Types.Mixed
  },
  lineCode: {
    type: String
  },
  resolveDiscussion: {
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
  collection: 'draft_notes'
});

// Indexes for common queries
DraftNoteSchema.index({ mergeRequestId: 1, authorId: 1 });
DraftNoteSchema.index({ projectId: 1, authorId: 1 });
DraftNoteSchema.index({ lastSyncedAt: 1, isDeleted: 1 });

// Instance methods
DraftNoteSchema.methods.markAsDeleted = function(this: IDraftNote) {
  this.isDeleted = true;
  return this.save();
};

export const DraftNote = mongoose.model<IDraftNote>('DraftNote', DraftNoteSchema);
