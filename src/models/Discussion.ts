import mongoose, { Schema, Document } from 'mongoose';

export interface IDiscussion extends Document {
  gitlabId: string;
  projectId: string;
  noteableType: 'Issue' | 'MergeRequest';
  noteableId: mongoose.Types.ObjectId;
  individualNote: boolean;
  resolved?: boolean;
  resolvable?: boolean;
  resolvedAt?: Date;
  noteIds: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
  lastSyncedAt: Date;
  isDeleted: boolean;

  // Category-level Sync Timestamps
  syncTimestamps?: {
    coreData?: Date;
    notes?: Date;
  };
}

const DiscussionSchema: Schema = new Schema({
  gitlabId: {
    type: String,
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
  noteableType: {
    type: String,
    enum: ['Issue', 'MergeRequest'],
    required: true,
    index: true
  },
  noteableId: {
    type: Schema.Types.ObjectId,
    refPath: 'noteableType',
    required: true,
    index: true
  },
  individualNote: {
    type: Boolean,
    default: false
  },
  resolved: {
    type: Boolean,
    default: false
  },
  resolvable: {
    type: Boolean,
    default: false
  },
  resolvedAt: {
    type: Date
  },
  noteIds: [{
    type: Schema.Types.ObjectId,
    ref: 'Note'
  }],
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
    notes: Date
  }
}, {
  timestamps: true,
  collection: 'discussions'
});

// Indexes for common queries
DiscussionSchema.index({ noteableType: 1, noteableId: 1 });
DiscussionSchema.index({ projectId: 1, noteableType: 1 });
DiscussionSchema.index({ lastSyncedAt: 1, isDeleted: 1 });

// Virtuals
DiscussionSchema.virtual('noteCount').get(function(this: IDiscussion) {
  return this.noteIds.length;
});

// Instance methods
DiscussionSchema.methods.markAsDeleted = function(this: IDiscussion) {
  this.isDeleted = true;
  return this.save();
};

export const Discussion = mongoose.model<IDiscussion>('Discussion', DiscussionSchema);
