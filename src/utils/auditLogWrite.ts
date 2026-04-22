import type { Request } from 'express';
import mongoose from 'mongoose';

import { AuditLog } from '../models/AuditLog';
import { logger } from './logger';

/**
 * Best-effort client IP for audit and rate-limit keys (honors X-Forwarded-For first hop when present).
 */
export function getRequestClientIp(req?: Request): string | undefined {
  if (!req) {
    return undefined;
  }

  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0]?.trim();
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0]?.split(',')[0]?.trim();
  }

  return req.ip || req.socket?.remoteAddress || undefined;
}

export interface AuditLogWriteInput {
  action: string;
  userId?: string;
  ip?: string;
  result: string;
  metadata?: Record<string, unknown>;
}

/**
 * Persists a security-relevant event to `AuditLog`. Never throws; logs failures only.
 */
export function recordAuditLogEntry(input: AuditLogWriteInput): void {
  void (async () => {
    try {
      const userId =
        input.userId && mongoose.Types.ObjectId.isValid(input.userId)
          ? new mongoose.Types.ObjectId(input.userId)
          : undefined;

      await AuditLog.create({
        action: input.action,
        userId,
        ip: input.ip,
        result: input.result,
        metadata: input.metadata,
      });
    } catch (error) {
      logger.error('Failed to write audit log entry', { action: input.action, error });
    }
  })();
}
