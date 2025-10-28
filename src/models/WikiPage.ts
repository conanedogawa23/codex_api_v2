import mongoose, { Schema, Document } from 'mongoose';

export interface IWikiPage extends Document {
  slug: string;
  projectId: string;
  title: string;
  content: string;
  format: 'markdown' | 'rdoc' | 'asciidoc' | 'org';
  encoding?: string;
  webUrl?: string;
  authorId?: mongoose.Types.ObjectId;
  lastModifiedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  lastSyncedAt: Date;
  isDeleted: boolean;

  // Category-level Sync Timestamps
  syncTimestamps?: {
    coreData?: Date;
    content?: Date;
    history?: Date;
  };
}

const WikiPageSchema: Schema = new Schema({
  slug: {
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
  title: {
    type: String,
    required: true,
    index: true
  },
  content: {
    type: String,
    required: true
  },
  format: {
    type: String,
    enum: ['markdown', 'rdoc', 'asciidoc', 'org'],
    default: 'markdown'
  },
  encoding: {
    type: String,
    default: 'UTF-8'
  },
  webUrl: {
    type: String
  },
  authorId: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  lastModifiedBy: {
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
    content: Date,
    history: Date
  }
}, {
  timestamps: true,
  collection: 'wiki_pages'
});

// Unique compound index
WikiPageSchema.index({ projectId: 1, slug: 1 }, { unique: true });
WikiPageSchema.index({ lastSyncedAt: 1, isDeleted: 1 });

// Virtuals
WikiPageSchema.virtual('contentLength').get(function(this: IWikiPage) {
  return this.content.length;
});

// Instance methods
WikiPageSchema.methods.markAsDeleted = function(this: IWikiPage) {
  this.isDeleted = true;
  return this.save();
};

export const WikiPage = mongoose.model<IWikiPage>('WikiPage', WikiPageSchema);
