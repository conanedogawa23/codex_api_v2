import mongoose, { Document, Schema } from 'mongoose';

export interface IFinanceRoleRate extends Document {
  roleKey: string;
  /** Normalized for uniqueness; empty string when not scoped to a department */
  departmentNormalized: string;
  department?: string;
  hourlyRate: number;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
}

const FinanceRoleRateSchema = new Schema(
  {
    roleKey: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    departmentNormalized: {
      type: String,
      required: true,
      default: '',
      trim: true,
      lowercase: true,
    },
    department: {
      type: String,
      trim: true,
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
    collection: 'financeRoleRates',
  }
);

FinanceRoleRateSchema.index({ roleKey: 1, departmentNormalized: 1 }, { unique: true });

export const FinanceRoleRate = mongoose.model<IFinanceRoleRate>(
  'FinanceRoleRate',
  FinanceRoleRateSchema
);
