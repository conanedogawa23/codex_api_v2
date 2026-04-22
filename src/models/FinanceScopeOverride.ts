import mongoose, { Document, Schema } from 'mongoose';

export type FinanceScopeType = 'PROJECT' | 'TASK' | 'SPRINT' | 'SPRINT_REPO';

export interface IFinanceScopeOverride extends Document {
  scopeType: FinanceScopeType;
  scopeId: string;
  hourlyRate: number;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
}

const FinanceScopeOverrideSchema = new Schema(
  {
    scopeType: {
      type: String,
      required: true,
      enum: ['PROJECT', 'TASK', 'SPRINT', 'SPRINT_REPO'],
      index: true,
    },
    scopeId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    hourlyRate: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
  },
  {
    timestamps: true,
    collection: 'financeScopeOverrides',
  }
);

FinanceScopeOverrideSchema.index({ scopeType: 1, scopeId: 1 }, { unique: true });

export const FinanceScopeOverride = mongoose.model<IFinanceScopeOverride>(
  'FinanceScopeOverride',
  FinanceScopeOverrideSchema
);
