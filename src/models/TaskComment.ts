import mongoose, { Document, Schema } from 'mongoose';

// Reaction interface
export interface IReaction {
  emoji: string;
  userId: string;
  userName: string;
}

// Attachment interface for comments
export interface ICommentAttachment {
  name: string;
  data?: string;
  url?: string;
  type: string;
  size: number;
}

// Static method interfaces
interface ITaskCommentModel extends mongoose.Model<ITaskComment> {
  findByTask(taskId: string): Promise<ITaskComment[]>;
  findByAuthor(authorId: string): Promise<ITaskComment[]>;
  findReplies(parentCommentId: string): Promise<ITaskComment[]>;
}

export interface ITaskComment extends Document {
  taskId: string;
  authorId: string;
  body: string;
  parentCommentId?: string;
  mentions: string[];
  reactions: IReaction[];
  attachments: ICommentAttachment[];
  isEdited: boolean;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
  
  // Instance methods
  edit(body: string): Promise<ITaskComment>;
  delete(): Promise<ITaskComment>;
  addReaction(emoji: string, userId: string, userName: string): Promise<ITaskComment>;
  removeReaction(emoji: string, userId: string): Promise<ITaskComment>;
  addAttachment(attachment: ICommentAttachment): Promise<ITaskComment>;
  removeAttachment(attachmentName: string): Promise<ITaskComment>;
}

const ReactionSchema = new Schema({
  emoji: {
    type: String,
    required: true
  },
  userId: {
    type: String,
    required: true,
    ref: 'User'
  },
  userName: {
    type: String,
    required: true
  }
}, { _id: false });

const CommentAttachmentSchema = new Schema({
  name: {
    type: String,
    required: true
  },
  data: {
    type: String,
    required: false
  },
  url: {
    type: String,
    required: false
  },
  type: {
    type: String,
    required: true
  },
  size: {
    type: Number,
    required: true
  }
}, { _id: false });

const TaskCommentSchema: Schema = new Schema({
  taskId: {
    type: String,
    required: true,
    index: true,
    ref: 'Task'
  },
  authorId: {
    type: String,
    required: true,
    index: true,
    ref: 'User'
  },
  body: {
    type: String,
    required: true,
    trim: true
  },
  parentCommentId: {
    type: String,
    index: true,
    ref: 'TaskComment'
  },
  mentions: [{
    type: String,
    ref: 'User'
  }],
  reactions: [ReactionSchema],
  attachments: [CommentAttachmentSchema],
  isEdited: {
    type: Boolean,
    default: false
  },
  isDeleted: {
    type: Boolean,
    default: false,
    index: true
  }
}, {
  timestamps: true,
  collection: 'task_comments'
});

// Compound indexes for better query performance
TaskCommentSchema.index({ taskId: 1, createdAt: 1 });
TaskCommentSchema.index({ taskId: 1, parentCommentId: 1 });
TaskCommentSchema.index({ authorId: 1, createdAt: -1 });

// Virtual for populated author
TaskCommentSchema.virtual('author', {
  ref: 'User',
  localField: 'authorId',
  foreignField: '_id',
  justOne: true
});

// Virtual for reply count
TaskCommentSchema.virtual('replyCount', {
  ref: 'TaskComment',
  localField: '_id',
  foreignField: 'parentCommentId',
  count: true
});

// Ensure virtuals are included when converting to JSON
TaskCommentSchema.set('toJSON', { virtuals: true });
TaskCommentSchema.set('toObject', { virtuals: true });

// Static method to find comments by task
TaskCommentSchema.statics.findByTask = function(taskId: string) {
  return this.find({ taskId, isDeleted: false }).sort({ createdAt: 1 });
};

// Static method to find comments by author
TaskCommentSchema.statics.findByAuthor = function(authorId: string) {
  return this.find({ authorId, isDeleted: false }).sort({ createdAt: -1 });
};

// Static method to find replies to a comment
TaskCommentSchema.statics.findReplies = function(parentCommentId: string) {
  return this.find({ parentCommentId, isDeleted: false }).sort({ createdAt: 1 });
};

// Instance method to edit comment
TaskCommentSchema.methods.edit = function(body: string) {
  this.body = body;
  this.isEdited = true;
  return this.save();
};

// Instance method to soft delete comment
TaskCommentSchema.methods.delete = function() {
  this.isDeleted = true;
  this.body = '[This comment has been deleted]';
  return this.save();
};

// Instance method to add reaction
TaskCommentSchema.methods.addReaction = function(emoji: string, userId: string, userName: string) {
  // Check if user already reacted with this emoji
  const existingReaction = this.reactions.find(
    (r: IReaction) => r.emoji === emoji && r.userId === userId
  );
  
  if (!existingReaction) {
    this.reactions.push({ emoji, userId, userName });
    return this.save();
  }
  
  return this;
};

// Instance method to remove reaction
TaskCommentSchema.methods.removeReaction = function(emoji: string, userId: string) {
  this.reactions = this.reactions.filter(
    (r: IReaction) => !(r.emoji === emoji && r.userId === userId)
  );
  return this.save();
};

// Instance method to add attachment
TaskCommentSchema.methods.addAttachment = function(attachment: ICommentAttachment) {
  if (!attachment.data && !attachment.url) {
    throw new Error('Attachment must have either data or url');
  }
  this.attachments.push(attachment);
  return this.save();
};

// Instance method to remove attachment
TaskCommentSchema.methods.removeAttachment = function(attachmentName: string) {
  this.attachments = this.attachments.filter(
    (a: ICommentAttachment) => a.name !== attachmentName
  );
  return this.save();
};

export const TaskComment = mongoose.model<ITaskComment, ITaskCommentModel>('TaskComment', TaskCommentSchema);

