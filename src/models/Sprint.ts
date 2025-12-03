import mongoose, { Schema, Document } from 'mongoose';

export interface ISprint extends Document {
  name: string;
  description?: string;
  sprintRepoId: string; // References SprintRepo (not Project)
  assignees: {
    id: string;
    name: string;
    email: string;
  }[];
  startDate: Date;
  endDate: Date;
  goal?: string;
  status: string; // Can be Zoho user ID or text status like 'active', 'planned', etc.
  statusName?: string; // Enriched status name (Upcoming, Active, Completed, Canceled)
  statusType?: number; // 1: Upcoming, 2: Active, 3: Completed, 4: Canceled
  zohoSprintId?: string;
  zohoProjectId?: string;
  projectName?: string; // Project name (from SprintRepo)
  source?: string; // 'zoho_sprints' or null for local
  velocity?: number;
  capacity?: number;
  progress: {
    totalTasks: number;
    completedTasks: number;
    percentage: number;
  };
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
  
  duration: number;
  isOverdue: boolean;
  
  // Instance methods
  assignUser(userId: string, userName: string, email: string): Promise<ISprint>;
  unassignUser(userId: string): Promise<ISprint>;
  updateProgress(totalTasks: number, completedTasks: number): Promise<ISprint>;
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
  sprintRepoId: {
    type: Schema.Types.ObjectId,
    required: true,
    index: true,
    ref: 'SprintRepo'
  },
  assignees: [{
    id: {
      type: String,
      required: true
    },
    name: {
      type: String,
      required: true
    },
    email: {
      type: String,
      required: true
    }
  }],
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
    default: 'planned',
    index: true
    // No enum restriction - supports Zoho user IDs and text statuses
  },
  statusName: {
    type: String
  },
  statusType: {
    type: Number
  },
  zohoSprintId: {
    type: String,
    index: true
  },
  zohoProjectId: {
    type: String,
    index: true
  },
  projectName: {
    type: String
  },
  source: {
    type: String
  },
  velocity: {
    type: Number,
    min: 0
  },
  capacity: {
    type: Number,
    min: 0
  },
  progress: {
    totalTasks: {
      type: Number,
      default: 0,
      min: 0
    },
    completedTasks: {
      type: Number,
      default: 0,
      min: 0
    },
    percentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    }
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

SprintSchema.index({ sprintRepoId: 1, status: 1 });
SprintSchema.index({ sprintRepoId: 1, startDate: 1, endDate: 1 });
SprintSchema.index({ 'assignees.id': 1 });

SprintSchema.virtual('duration').get(function(this: ISprint) {
  return Math.ceil((this.endDate.getTime() - this.startDate.getTime()) / (1000 * 60 * 60 * 24));
});

SprintSchema.virtual('isOverdue').get(function(this: ISprint) {
  // For text statuses, check if completed/cancelled. For Zoho user IDs, check by date only
  const textStatus = this.status?.toLowerCase();
  const isCompleted = textStatus === 'completed' || textStatus === 'cancelled';
  return !isCompleted && this.endDate < new Date();
});

// Instance method to assign user
SprintSchema.methods.assignUser = function(userId: string, userName: string, email: string) {
  const existingAssignment = this.assignees.find((assignee: { id: string; name: string; email: string }) => assignee.id === userId);
  if (!existingAssignment) {
    this.assignees.push({ id: userId, name: userName, email });
    return this.save();
  }
  return this;
};

// Instance method to unassign user
SprintSchema.methods.unassignUser = function(userId: string) {
  this.assignees = this.assignees.filter((assignee: { id: string; name: string; email: string }) => assignee.id !== userId);
  return this.save();
};

// Instance method to update progress
SprintSchema.methods.updateProgress = function(totalTasks: number, completedTasks: number) {
  this.progress = {
    totalTasks,
    completedTasks,
    percentage: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
  };
  return this.save();
};

export const Sprint = mongoose.model<ISprint>('Sprint', SprintSchema);

