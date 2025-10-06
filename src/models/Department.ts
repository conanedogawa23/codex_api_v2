import mongoose, { Document, Schema } from 'mongoose';

// Static method interfaces
interface IDepartmentModel extends mongoose.Model<IDepartment> {
  findActive(): Promise<IDepartment[]>;
}

export interface IDepartment extends Document {
  gitlabId?: number;
  name: string;
  description?: string;
  head?: {
    id: string;
    name: string;
    email: string;
  };
  members: string[]; // User IDs
  projects: string[]; // Project IDs
  budget?: number;
  location?: string;
  isActive: boolean;
  memberCount?: number;
  projectCount?: number;
  createdAt: Date;
  updatedAt: Date;
  
  // Instance methods
  addMember(userId: string): Promise<IDepartment>;
  removeMember(userId: string): Promise<IDepartment>;
  addProject(projectId: string): Promise<IDepartment>;
  removeProject(projectId: string): Promise<IDepartment>;
}

const DepartmentSchema: Schema = new Schema({
  gitlabId: {
    type: Number,
    index: true
  },
  name: {
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
  head: {
    id: String,
    name: String,
    email: String
  },
  members: [{
    type: String, // User IDs
    ref: 'User'
  }],
  projects: [{
    type: String, // Project IDs
    ref: 'Project'
  }],
  budget: {
    type: Number,
    min: 0
  },
  location: {
    type: String,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  collection: 'departments'
});

// Indexes for better query performance
DepartmentSchema.index({ name: 1 });
DepartmentSchema.index({ isActive: 1 });
DepartmentSchema.index({ 'head.id': 1 });

// Virtual for member count
DepartmentSchema.virtual('memberCount').get(function() {
  return this.members.length;
});

// Virtual for project count
DepartmentSchema.virtual('projectCount').get(function() {
  return this.projects.length;
});

// Static method to find active departments
DepartmentSchema.statics.findActive = function() {
  return this.find({ isActive: true });
};

// Instance method to add member
DepartmentSchema.methods.addMember = function(userId: string) {
  if (!this.members.includes(userId)) {
    this.members.push(userId);
    return this.save();
  }
  return this;
};

// Instance method to remove member
DepartmentSchema.methods.removeMember = function(userId: string) {
  this.members = this.members.filter((id: string) => id !== userId);
  return this.save();
};

// Instance method to add project
DepartmentSchema.methods.addProject = function(projectId: string) {
  if (!this.projects.includes(projectId)) {
    this.projects.push(projectId);
    return this.save();
  }
  return this;
};

// Instance method to remove project
DepartmentSchema.methods.removeProject = function(projectId: string) {
  this.projects = this.projects.filter((id: string) => id !== projectId);
  return this.save();
};

export const Department = mongoose.model<IDepartment, IDepartmentModel>('Department', DepartmentSchema);
