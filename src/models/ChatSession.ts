import mongoose, { Document, Schema, Types } from 'mongoose';

interface IChatToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface IChatMessage {
  role: 'assistant' | 'system' | 'tool' | 'user';
  content: string;
  toolCallId?: string;
  toolCalls?: IChatToolCall[];
  name?: string;
  isError?: boolean;
  timestamp: Date;
}

interface IChatSessionModel extends mongoose.Model<IChatSession> {
  findByUser(userId: string, projectId?: string, limit?: number): Promise<IChatSession[]>;
}

export interface IChatSession extends Document {
  userId: Types.ObjectId;
  projectId?: Types.ObjectId;
  title: string;
  messages: IChatMessage[];
  createdAt: Date;
  updatedAt: Date;
}

const ChatToolCallSchema = new Schema<IChatToolCall>(
  {
    id: {
      type: String,
      required: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    arguments: {
      type: String,
      required: true,
      default: '{}',
    },
  },
  { _id: false }
);

const ChatMessageSchema = new Schema<IChatMessage>(
  {
    role: {
      type: String,
      enum: ['assistant', 'system', 'tool', 'user'],
      required: true,
    },
    content: {
      type: String,
      default: '',
    },
    toolCallId: {
      type: String,
      trim: true,
    },
    toolCalls: {
      type: [ChatToolCallSchema],
      default: undefined,
    },
    name: {
      type: String,
      trim: true,
    },
    isError: {
      type: Boolean,
      default: false,
    },
    timestamp: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  { _id: false }
);

const ChatSessionSchema = new Schema<IChatSession, IChatSessionModel>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    messages: {
      type: [ChatMessageSchema],
      default: [],
    },
  },
  {
    timestamps: true,
    collection: 'chat_sessions',
  }
);

ChatSessionSchema.index({ userId: 1, updatedAt: -1 });
ChatSessionSchema.index({ userId: 1, projectId: 1, updatedAt: -1 });

ChatSessionSchema.statics.findByUser = function findByUser(userId: string, projectId?: string, limit = 20) {
  const filter: Record<string, unknown> = { userId };
  if (projectId) {
    filter.projectId = projectId;
  }

  return this.find(filter)
    .sort({ updatedAt: -1 })
    .limit(limit)
    .lean();
};

export const ChatSession = mongoose.model<IChatSession, IChatSessionModel>(
  'ChatSession',
  ChatSessionSchema
);
