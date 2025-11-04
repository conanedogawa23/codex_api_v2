import mongoose, { Schema, Document } from 'mongoose';

export interface ICommit extends Document {
  gitlabId: number;
  sha: string;
  projectId: string;
  shortId: string;
  title: string;
  message: string;
  authorName: string;
  authorEmail: string;
  authoredDate: Date;
  committerName: string;
  committerEmail: string;
  committedDate: Date;
  webUrl: string;
  parentIds: string[];
  stats?: {
    additions: number;
    deletions: number;
    total: number;
  };
  userId?: mongoose.Types.ObjectId;
  lastSyncedAt: Date;
  isDeleted: boolean;
  createdAt: Date;

  // Category-level Sync Timestamps
  syncTimestamps?: {
    coreData?: Date;
    diffStats?: Date;
    references?: Date;
    signatures?: Date;
  };
}

const CommitSchema: Schema = new Schema({
  gitlabId: {
    type: Number,
    required: true,
    unique: true,
    index: true
  },
  sha: {
    type: String,
    required: true,
    index: true
  },
  projectId: {
    type: String,
    ref: 'Project',
    required: true,
    index: true
  },
  shortId: {
    type: String,
    required: true
  },
  title: {
    type: String,
    required: true,
    index: true
  },
  message: {
    type: String,
    required: true
  },
  authorName: {
    type: String,
    required: true,
    index: true
  },
  authorEmail: {
    type: String,
    required: true
  },
  authoredDate: {
    type: Date,
    required: true,
    index: true
  },
  committerName: {
    type: String,
    required: true
  },
  committerEmail: {
    type: String,
    required: true
  },
  committedDate: {
    type: Date,
    required: true,
    index: true
  },
  webUrl: {
    type: String,
    required: true
  },
  parentIds: [{
    type: String
  }],
  stats: {
    additions: {
      type: Number,
      default: 0,
      min: 0
    },
    deletions: {
      type: Number,
      default: 0,
      min: 0
    },
    total: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  userId: {
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
    diffStats: Date,
    references: Date,
    signatures: Date
  }
}, {
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'commits'
});

// Indexes for common queries
CommitSchema.index({ projectId: 1, authoredDate: -1 });
CommitSchema.index({ projectId: 1, authorName: 1 });
CommitSchema.index({ sha: 1, projectId: 1 });
CommitSchema.index({ lastSyncedAt: 1, isDeleted: 1 });

// Virtuals
CommitSchema.virtual('isMergeCommit').get(function(this: ICommit) {
  return this.parentIds.length > 1;
});

// Instance methods
CommitSchema.methods.markAsDeleted = function(this: ICommit) {
  this.isDeleted = true;
  return this.save();
};

export const Commit = mongoose.model<ICommit>('Commit', CommitSchema);
