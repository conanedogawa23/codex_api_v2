import mongoose, { Schema, Document } from 'mongoose';

export interface ILabel extends Document {
  gitlabId: number;
  projectId: string;
  name: string;
  color: string;
  description?: string;
  descriptionHtml?: string;
  textColor?: string;
  priority?: number;
  subscribed: boolean;
  openIssuesCount: number;
  closedIssuesCount: number;
  openMergeRequestsCount: number;
  isProjectLabel: boolean;
  webUrl?: string;
  lastSyncedAt: Date;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;

  // Category-level Sync Timestamps
  syncTimestamps?: {
    coreData?: Date;
    usageStats?: Date;
    relatedIssues?: Date;
  };
}

const LabelSchema: Schema = new Schema({
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
  name: {
    type: String,
    required: true,
    index: true
  },
  color: {
    type: String,
    required: true,
    validate: {
      validator: (v: string) => /^#[0-9A-F]{6}$/i.test(v),
      message: 'Color must be a valid hex color code'
    }
  },
  description: {
    type: String,
    default: ''
  },
  descriptionHtml: {
    type: String
  },
  textColor: {
    type: String,
    validate: {
      validator: (v: string) => /^#[0-9A-F]{6}$/i.test(v),
      message: 'Text color must be a valid hex color code'
    }
  },
  priority: {
    type: Number,
    default: null
  },
  subscribed: {
    type: Boolean,
    default: false
  },
  openIssuesCount: {
    type: Number,
    default: 0,
    min: 0
  },
  closedIssuesCount: {
    type: Number,
    default: 0,
    min: 0
  },
  openMergeRequestsCount: {
    type: Number,
    default: 0,
    min: 0
  },
  isProjectLabel: {
    type: Boolean,
    default: true
  },
  webUrl: {
    type: String
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
    usageStats: Date,
    relatedIssues: Date
  }
}, {
  timestamps: true,
  collection: 'labels'
});

// Indexes for common queries
LabelSchema.index({ projectId: 1, name: 1 });
LabelSchema.index({ projectId: 1, isDeleted: 1 });
LabelSchema.index({ lastSyncedAt: 1, isDeleted: 1 });

// Virtual for total issue count
LabelSchema.virtual('totalIssuesCount').get(function(this: ILabel) {
  return this.openIssuesCount + this.closedIssuesCount;
});

// Instance method to mark as deleted
LabelSchema.methods.markAsDeleted = function(this: ILabel) {
  this.isDeleted = true;
  return this.save();
};

export const Label = mongoose.model<ILabel>('Label', LabelSchema);
