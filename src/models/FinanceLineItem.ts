import mongoose, { Document, Schema } from 'mongoose';

export type FinanceLineItemKind = 'FIXED_FEE' | 'MONTHLY_LICENSE' | 'OTHER';

export interface IFinanceLineItem extends Document {
  projectId: mongoose.Types.ObjectId;
  sprintRepoId?: mongoose.Types.ObjectId;
  sprintId?: mongoose.Types.ObjectId;
  kind: FinanceLineItemKind;
  label: string;
  amount: number;
  currency: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const FinanceLineItemSchema = new Schema(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'Project',
      index: true,
    },
    sprintRepoId: {
      type: Schema.Types.ObjectId,
      ref: 'SprintRepo',
      index: true,
    },
    sprintId: {
      type: Schema.Types.ObjectId,
      ref: 'Sprint',
      index: true,
    },
    kind: {
      type: String,
      required: true,
      enum: ['FIXED_FEE', 'MONTHLY_LICENSE', 'OTHER'],
      index: true,
    },
    label: {
      type: String,
      required: true,
      trim: true,
    },
    amount: {
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
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: 'financeLineItems',
  }
);

FinanceLineItemSchema.index({ projectId: 1, isActive: 1 });

export const FinanceLineItem = mongoose.model<IFinanceLineItem>(
  'FinanceLineItem',
  FinanceLineItemSchema
);
