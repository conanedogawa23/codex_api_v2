import mongoose, { Document, Schema } from 'mongoose';

// Static method interfaces
interface IProjectSprintRepoMappingModel extends mongoose.Model<IProjectSprintRepoMapping> {
  findByProject(projectId: string): Promise<IProjectSprintRepoMapping[]>;
  findBySprintRepo(sprintRepoId: string): Promise<IProjectSprintRepoMapping[]>;
  findMapping(projectId: string, sprintRepoId: string): Promise<IProjectSprintRepoMapping | null>;
}

export interface IProjectSprintRepoMapping extends Document {
  projectId: string;
  sprintRepoId: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;

  // Instance methods
  activate(): Promise<IProjectSprintRepoMapping>;
  deactivate(): Promise<IProjectSprintRepoMapping>;
}

const ProjectSprintRepoMappingSchema: Schema = new Schema({
  projectId: {
    type: String,
    required: true,
    index: true,
    ref: 'Project'
  },
  sprintRepoId: {
    type: Schema.Types.ObjectId,
    required: true,
    index: true,
    ref: 'SprintRepo'
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  }
}, {
  timestamps: true,
  collection: 'project_sprint_repo_mappings'
});

// Compound unique index to prevent duplicate mappings
ProjectSprintRepoMappingSchema.index(
  { projectId: 1, sprintRepoId: 1 },
  { unique: true }
);

// Indexes for better query performance
ProjectSprintRepoMappingSchema.index({ projectId: 1, isActive: 1 });
ProjectSprintRepoMappingSchema.index({ sprintRepoId: 1, isActive: 1 });

// Static method to find mappings by project
ProjectSprintRepoMappingSchema.statics.findByProject = function(projectId: string) {
  return this.find({ projectId, isActive: true })
    .populate('sprintRepoId')
    .lean();
};

// Static method to find mappings by sprint repo
ProjectSprintRepoMappingSchema.statics.findBySprintRepo = function(sprintRepoId: string) {
  return this.find({ sprintRepoId, isActive: true })
    .lean();
};

// Static method to find a specific mapping
ProjectSprintRepoMappingSchema.statics.findMapping = function(projectId: string, sprintRepoId: string) {
  return this.findOne({ projectId, sprintRepoId, isActive: true }).lean();
};

// Instance method to activate mapping
ProjectSprintRepoMappingSchema.methods.activate = function() {
  this.isActive = true;
  return this.save();
};

// Instance method to deactivate mapping
ProjectSprintRepoMappingSchema.methods.deactivate = function() {
  this.isActive = false;
  return this.save();
};

export const ProjectSprintRepoMapping = mongoose.model<IProjectSprintRepoMapping, IProjectSprintRepoMappingModel>(
  'ProjectSprintRepoMapping',
  ProjectSprintRepoMappingSchema
);
