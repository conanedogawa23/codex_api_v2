import mongoose, { Schema, Document } from 'mongoose';

export interface ISprint extends Document {
  name: string;
  description?: string;
  projectId: string;
  startDate: Date;
  endDate: Date;
  goal?: string;
  status: 'planned' | 'active' | 'completed' | 'cancelled';
  velocity?: number;
  capacity?: number;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
  
  duration: number;
  isOverdue: boolean;
}

const SprintSchema: Schema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  projectId: {
    type: String,
    required: true,
    index: true,
    ref: 'Project'
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  goal: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['planned', 'active', 'completed', 'cancelled'],
    default: 'planned',
    index: true
  },
  velocity: {
    type: Number,
    min: 0
  },
  capacity: {
    type: Number,
    min: 0
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  }
}, {
  timestamps: true,
  collection: 'sprints'
});

SprintSchema.index({ projectId: 1, status: 1 });
SprintSchema.index({ projectId: 1, startDate: 1, endDate: 1 });

SprintSchema.virtual('duration').get(function(this: ISprint) {
  return Math.ceil((this.endDate.getTime() - this.startDate.getTime()) / (1000 * 60 * 60 * 24));
});

SprintSchema.virtual('isOverdue').get(function(this: ISprint) {
  return this.status !== 'completed' && this.status !== 'cancelled' && this.endDate < new Date();
});

export const Sprint = mongoose.model<ISprint>('Sprint', SprintSchema);

