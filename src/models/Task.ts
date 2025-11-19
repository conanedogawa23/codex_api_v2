import mongoose, { Document, Schema } from 'mongoose';

// Static method interfaces
interface ITaskModel extends mongoose.Model<ITask> {
  findByProject(projectId: string): Promise<ITask[]>;
  findByAssignee(userId: string): Promise<ITask[]>;
  findOverdue(): Promise<ITask[]>;
  findByStatus(status: string): Promise<ITask[]>;
}

export interface ITask extends Document {
  gitlabIssueId?: number;
  title: string;
  description?: string;
  status: 'pending' | 'in-progress' | 'completed' | 'delayed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  projectId: string; // REQUIRED: All tasks must be associated with a project
  assignedTo?: {
    id: string;
    name: string;
    email: string;
  };
  assignedBy?: {
    id: string;
    name: string;
    email: string;
  };
  dueDate?: Date;
  completionPercentage: number;
  tags: string[];
  comments: number;
  estimatedHours?: number;
  actualHours?: number;
  dependencies: string[]; // Task IDs this task depends on
  subtasks: string[]; // Subtask IDs
  attachments: {
    name: string;
    url: string;
    type: string;
  }[];
  lastSynced: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  
  // Instance methods
  updateProgress(percentage: number): Promise<ITask>;
  updateSyncTimestamp(): Promise<ITask>;
  addTag(tag: string): Promise<ITask>;
  removeTag(tag: string): Promise<ITask>;
}

const TaskSchema: Schema = new Schema({
  gitlabIssueId: {
    type: Number,
    unique: true,
    sparse: true,
    index: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['pending', 'in-progress', 'completed', 'delayed', 'cancelled'],
    default: 'pending',
    index: true
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium',
    index: true
  },
  projectId: {
    type: String,
    required: true,
    index: true,
    ref: 'Project'
  },
  assignedTo: {
    id: {
      type: String,
      ref: 'User'
    },
    name: String,
    email: String
  },
  assignedBy: {
    id: {
      type: String,
      ref: 'User'
    },
    name: String,
    email: String
  },
  dueDate: {
    type: Date,
    index: true
  },
  completionPercentage: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  tags: [{
    type: String,
    trim: true
  }],
  comments: {
    type: Number,
    default: 0
  },
  estimatedHours: {
    type: Number,
    min: 0
  },
  actualHours: {
    type: Number,
    min: 0
  },
  dependencies: [{
    type: String,
    ref: 'Task'
  }],
  subtasks: [{
    type: String,
    ref: 'Task'
  }],
  attachments: [{
    name: {
      type: String,
      required: true
    },
    url: {
      type: String,
      required: true
    },
    type: {
      type: String,
      required: true
    }
  }],
  lastSynced: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  collection: 'tasks'
});

// Compound indexes for better query performance
TaskSchema.index({ projectId: 1, status: 1 });
TaskSchema.index({ 'assignedTo.id': 1, status: 1 });
TaskSchema.index({ priority: 1, dueDate: 1 });
TaskSchema.index({ tags: 1 });
TaskSchema.index({ status: 1, dueDate: 1 });
TaskSchema.index({ lastSynced: 1 });

// Virtual for overdue status
TaskSchema.virtual('isOverdue').get(function() {
  return this.dueDate && this.dueDate < new Date() && this.status !== 'completed';
});

// Virtual for days until due
TaskSchema.virtual('daysUntilDue').get(function() {
  if (!this.dueDate) return null;
  const now = new Date();
  const diffTime = this.dueDate.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Static method to find by project
TaskSchema.statics.findByProject = function(projectId: string) {
  return this.find({ projectId, isActive: true });
};

// Static method to find by assignee
TaskSchema.statics.findByAssignee = function(userId: string) {
  return this.find({ 'assignedTo.id': userId, isActive: true });
};

// Static method to find overdue tasks
TaskSchema.statics.findOverdue = function() {
  return this.find({
    dueDate: { $lt: new Date() },
    status: { $nin: ['completed', 'cancelled'] },
    isActive: true
  });
};

// Static method to find tasks by status
TaskSchema.statics.findByStatus = function(status: string) {
  return this.find({ status, isActive: true });
};

// Instance method to update completion percentage
TaskSchema.methods.updateProgress = function(percentage: number) {
  this.completionPercentage = Math.max(0, Math.min(100, percentage));
  if (percentage >= 100) {
    this.status = 'completed';
  } else if (percentage > 0 && this.status === 'pending') {
    this.status = 'in-progress';
  }
  return this.save();
};

// Instance method to update sync timestamp
TaskSchema.methods.updateSyncTimestamp = function() {
  this.lastSynced = new Date();
  return this.save();
};

// Instance method to add tag
TaskSchema.methods.addTag = function(tag: string) {
  if (!this.tags.includes(tag)) {
    this.tags.push(tag);
    return this.save();
  }
  return this;
};

// Instance method to remove tag
TaskSchema.methods.removeTag = function(tag: string) {
  this.tags = this.tags.filter((t: string) => t !== tag);
  return this.save();
};

export const Task = mongoose.model<ITask, ITaskModel>('Task', TaskSchema);
