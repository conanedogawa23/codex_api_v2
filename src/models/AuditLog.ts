import mongoose, { Schema } from 'mongoose';

export interface AuditLogDocument extends mongoose.Document {
  action: string;
  userId?: mongoose.Types.ObjectId;
  ip?: string;
  metadata?: Record<string, unknown>;
  result: string;
  createdAt: Date;
  updatedAt: Date;
}

const auditLogSchema = new Schema<AuditLogDocument>(
  {
    action: { type: String, required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    ip: { type: String },
    metadata: { type: Schema.Types.Mixed },
    result: { type: String, required: true },
  },
  { timestamps: true }
);

auditLogSchema.index({ createdAt: -1 });

export const AuditLog = mongoose.model<AuditLogDocument>('AuditLog', auditLogSchema);
