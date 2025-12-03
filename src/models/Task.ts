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
  sprintId?: string; // Optional: Sprint assignment (null for backlog tasks)
  storyPoints?: number; // Optional: Story points for sprint planning
  sprintOrder?: number; // Optional: Order within sprint
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
    url?: string; // Optional: for backward compatibility with URL-based attachments
    data?: string; // Optional: base64 encoded file data
    type: string;
    size?: number; // Optional: file size in bytes
  }[];
  lastSynced: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  
  // Zoho Sprints specific fields
  zohoItemId?: string;
  zohoItemNumber?: string;
  zohoProjectId?: string;
  zohoSprintId?: string;
  zohoItemTypeId?: string;
  zohoItemTypeName?: string;
  zohoItemTypeColor?: string;
  zohoPriorityId?: string;
  zohoPriorityName?: string;
  zohoPriorityColor?: string;
  zohoStatusId?: string;
  zohoStatusName?: string;
  zohoStatusType?: number;
  zohoStatusColor?: string;
  zohoEpicId?: string;
  source?: string; // 'gitlab' or 'zoho_sprints'
  duration?: string; // Duration string (e.g., "8h", "5d 12h")
  
  // Instance methods
  updateProgress(percentage: number): Promise<ITask>;
  updateSyncTimestamp(): Promise<ITask>;
  addTag(tag: string): Promise<ITask>;
  removeTag(tag: string): Promise<ITask>;
  addAttachment(attachment: any): Promise<ITask>;
  removeAttachment(attachmentName: string): Promise<ITask>;
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
  sprintId: {
    type: String,
    index: true,
    ref: 'Sprint'
  },
  storyPoints: {
    type: Number,
    min: 0
  },
  sprintOrder: {
    type: Number
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
      required: false // Optional for backward compatibility
    },
    data: {
      type: String, // base64 encoded file data
      required: false
    },
    type: {
      type: String,
      required: true
    },
    size: {
      type: Number, // file size in bytes
      required: false
    }
  }],
  lastSynced: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  },
  zohoItemId: {
    type: String,
    unique: true,
    sparse: true,
    index: true
  },
  zohoItemNumber: {
    type: String,
    sparse: true
  },
  zohoProjectId: {
    type: String,
    index: true
  },
  zohoSprintId: {
    type: String,
    index: true
  },
  zohoItemTypeId: {
    type: String
  },
  zohoItemTypeName: {
    type: String
  },
  zohoItemTypeColor: {
    type: String
  },
  zohoPriorityId: {
    type: String
  },
  zohoPriorityName: {
    type: String
  },
  zohoPriorityColor: {
    type: String
  },
  zohoStatusId: {
    type: String
  },
  zohoStatusName: {
    type: String
  },
  zohoStatusType: {
    type: Number
  },
  zohoStatusColor: {
    type: String
  },
  zohoEpicId: {
    type: String
  },
  source: {
    type: String,
    enum: ['gitlab', 'zoho_sprints', 'manual'],
    index: true
  },
  duration: {
    type: String
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
TaskSchema.index({ sprintId: 1, sprintOrder: 1 });
TaskSchema.index({ projectId: 1, sprintId: 1 });
TaskSchema.index({ source: 1, projectId: 1 });
TaskSchema.index({ zohoProjectId: 1, zohoSprintId: 1 });

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

// Instance method to add attachment
TaskSchema.methods.addAttachment = function(attachment: any) {
  // Validate attachment has required fields
  if (!attachment.name || !attachment.type) {
    throw new Error('Attachment must have name and type');
  }
  
  // Ensure either url or data is provided
  if (!attachment.url && !attachment.data) {
    throw new Error('Attachment must have either url or data');
  }
  
  // Check for duplicate attachment names
  const existingAttachment = this.attachments.find((a: any) => a.name === attachment.name);
  if (existingAttachment) {
    throw new Error(`Attachment with name "${attachment.name}" already exists`);
  }
  
  this.attachments.push(attachment);
  return this.save();
};

// Instance method to remove attachment
TaskSchema.methods.removeAttachment = function(attachmentName: string) {
  this.attachments = this.attachments.filter((a: any) => a.name !== attachmentName);
  return this.save();
};

export const Task = mongoose.model<ITask, ITaskModel>('Task', TaskSchema);
