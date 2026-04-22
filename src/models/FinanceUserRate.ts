import mongoose, { Document, Schema } from 'mongoose';

export interface IFinanceUserRate extends Document {
  userId: mongoose.Types.ObjectId;
  hourlyRate: number;
  currency: string;
  effectiveFrom: Date;
  effectiveTo?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const FinanceUserRateSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'User',
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
    effectiveFrom: {
      type: Date,
      required: true,
      index: true,
    },
    effectiveTo: {
      type: Date,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: 'financeUserRates',
  }
);

FinanceUserRateSchema.index({ userId: 1, effectiveFrom: -1 });

export const FinanceUserRate = mongoose.model<IFinanceUserRate>(
  'FinanceUserRate',
  FinanceUserRateSchema
);
