import mongoose, { Schema, Document } from 'mongoose';

export interface IAttachment extends Document {
  projectId: string;
  secret: string;
  filename: string;
  url: string;
  alt?: string;
  markdown: string;
  uploadedBy?: mongoose.Types.ObjectId;
  size?: number;
  mimeType?: string;
  createdAt: Date;
  lastSyncedAt: Date;
  isDeleted: boolean;
}

const AttachmentSchema: Schema = new Schema({
  projectId: {
    type: String,
    ref: 'Project',
    required: true,
    index: true
  },
  secret: {
    type: String,
    required: true,
    index: true
  },
  filename: {
    type: String,
    required: true,
    index: true
  },
  url: {
    type: String,
    required: true,
    unique: true
  },
  alt: {
    type: String
  },
  markdown: {
    type: String,
    required: true
  },
  uploadedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  size: {
    type: Number,
    min: 0
  },
  mimeType: {
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
  }
}, {
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'attachments'
});

// Indexes for common queries
AttachmentSchema.index({ projectId: 1, secret: 1, filename: 1 }, { unique: true });
AttachmentSchema.index({ uploadedBy: 1, createdAt: -1 });
AttachmentSchema.index({ lastSyncedAt: 1, isDeleted: 1 });

// Virtuals
AttachmentSchema.virtual('isImage').get(function(this: IAttachment) {
  if (!this.mimeType) return false;
  return this.mimeType.startsWith('image/');
});

AttachmentSchema.virtual('extension').get(function(this: IAttachment) {
  const parts = this.filename.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
});

// Instance methods
AttachmentSchema.methods.markAsDeleted = function(this: IAttachment) {
  this.isDeleted = true;
  return this.save();
};

export const Attachment = mongoose.model<IAttachment>('Attachment', AttachmentSchema);
