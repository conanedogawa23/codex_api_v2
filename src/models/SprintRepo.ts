import mongoose, { Document, Schema } from 'mongoose';

// Static method interfaces
interface ISprintRepoModel extends mongoose.Model<ISprintRepo> {
  findByKey(key: string): Promise<ISprintRepo | null>;
  findByOwner(ownerId: string): Promise<ISprintRepo[]>;
  findByGroup(groupId: string): Promise<ISprintRepo[]>;
  findByStatus(status: string): Promise<ISprintRepo[]>;
}

export interface ISprintRepo extends Document {
  name: string;
  key: string;
  description?: string;
  ownerId: string;
  ownerName: string;
  groupId?: string;
  groupName?: string;
  status: 'active' | 'archived' | 'completed';
  startDate?: Date;
  endDate?: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;

  // Instance methods
  archive(): Promise<ISprintRepo>;
  activate(): Promise<ISprintRepo>;
}

const SprintRepoSchema: Schema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  key: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true
  },
  description: {
    type: String,
    trim: true
  },
  ownerId: {
    type: String,
    required: true,
    index: true
  },
  ownerName: {
    type: String,
    required: true,
    trim: true
  },
  groupId: {
    type: String,
    index: true
  },
  groupName: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['active', 'archived', 'completed'],
    default: 'active',
    index: true
  },
  startDate: {
    type: Date
  },
  endDate: {
    type: Date
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  }
}, {
  timestamps: true,
  collection: 'sprintRepos'
});

// Indexes for better query performance
SprintRepoSchema.index({ key: 1 }, { unique: true });
SprintRepoSchema.index({ ownerId: 1, status: 1 });
SprintRepoSchema.index({ groupId: 1, status: 1 });
SprintRepoSchema.index({ status: 1, isActive: 1 });
SprintRepoSchema.index({ name: 'text' }); // Text search on name

// Virtual for duration
SprintRepoSchema.virtual('duration').get(function(this: ISprintRepo) {
  if (!this.startDate || !this.endDate) return null;
  return Math.ceil((this.endDate.getTime() - this.startDate.getTime()) / (1000 * 60 * 60 * 24));
});

// Static method to find by key
SprintRepoSchema.statics.findByKey = function(key: string) {
  return this.findOne({ key, isActive: true }).lean();
};

// Static method to find by owner
SprintRepoSchema.statics.findByOwner = function(ownerId: string) {
  return this.find({ ownerId, isActive: true }).lean();
};

// Static method to find by group
SprintRepoSchema.statics.findByGroup = function(groupId: string) {
  return this.find({ groupId, isActive: true }).lean();
};

// Static method to find by status
SprintRepoSchema.statics.findByStatus = function(status: string) {
  return this.find({ status, isActive: true }).lean();
};

// Instance method to archive
SprintRepoSchema.methods.archive = function() {
  this.status = 'archived';
  return this.save();
};

// Instance method to activate
SprintRepoSchema.methods.activate = function() {
  this.status = 'active';
  return this.save();
};

export const SprintRepo = mongoose.model<ISprintRepo, ISprintRepoModel>('SprintRepo', SprintRepoSchema);

