import mongoose, { Document, Schema } from 'mongoose';

export interface IFinanceGlobalSettings extends Document {
  singletonKey: string;
  defaultHourlyRate: number;
  defaultCurrency: string;
  createdAt: Date;
  updatedAt: Date;
}

const FinanceGlobalSettingsSchema = new Schema(
  {
    singletonKey: {
      type: String,
      required: true,
      unique: true,
      default: 'default',
      index: true,
    },
    defaultHourlyRate: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    defaultCurrency: {
      type: String,
      required: true,
      trim: true,
      default: 'USD',
      uppercase: true,
    },
  },
  {
    timestamps: true,
    collection: 'financeGlobalSettings',
  }
);

export const FinanceGlobalSettings = mongoose.model<IFinanceGlobalSettings>(
  'FinanceGlobalSettings',
  FinanceGlobalSettingsSchema
);
