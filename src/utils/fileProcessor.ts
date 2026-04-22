import { randomUUID } from 'crypto';
import { isIPv4, isIPv6 } from 'net';

import FileType from 'file-type';
import sanitizeFilename from 'sanitize-filename';

import { AppError } from '../middleware';
import { AuditLog } from '../models/AuditLog';
import { logger } from './logger';

/**
 * Attachments are stored inline (base64) or by URL; there is no HTTP download route today.
 * If a future `/uploads/*` or similar route is added, responses must set
 * `X-Content-Type-Options: nosniff` and `Content-Disposition: attachment` for types that can execute inline (e.g. PDF).
 */

const MAX_FILE_SIZE = 5 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/json',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

const TEXTLIKE_MIME = new Set(['text/plain', 'text/csv', 'application/json']);

const OOXML_MIME = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'application/json': 'json',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
};

export interface RawAttachmentInput {
  name: string;
  type: string;
  size?: number;
  data?: string;
  url?: string;
}

export interface ProcessedAttachment {
  name: string;
  type: string;
  size: number;
  data?: string;
  url?: string;
}

export interface AttachmentAuditContext {
  userId: string;
  taskId?: string;
  commentId?: string;
  ip?: string;
}

function throwInvalid(): never {
  throw new AppError('Invalid attachment', 400);
}

function extractBase64Payload(raw: string): { declaredMime?: string; base64: string } {
  if (!raw || !raw.trim()) {
    throwInvalid();
  }
  if (raw.startsWith('data:')) {
    const matches = raw.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) {
      throwInvalid();
    }
    return { declaredMime: matches[1], base64: matches[2] };
  }
  return { base64: raw.replace(/\s/g, '') };
}

function decodeBase64ToBuffer(base64: string): Buffer {
  try {
    return Buffer.from(base64, 'base64');
  } catch {
    throwInvalid();
  }
}

function isBlockedUrlHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost')) {
    return true;
  }
  if (h === 'metadata.google.internal' || h.endsWith('.internal')) {
    return true;
  }
  if (h === '169.254.169.254') {
    return true;
  }

  if (isIPv4(h)) {
    const parts = h.split('.').map((x) => Number(x));
    const [a, b] = parts;
    if (a === 10) {
      return true;
    }
    if (a === 127) {
      return true;
    }
    if (a === 169 && b === 254) {
      return true;
    }
    if (a === 172 && b >= 16 && b <= 31) {
      return true;
    }
    if (a === 192 && b === 168) {
      return true;
    }
    if (a === 0 && parts[1] === 0 && parts[2] === 0 && parts[3] === 0) {
      return true;
    }
    return false;
  }

  if (isIPv6(h)) {
    const lower = h.toLowerCase();
    if (lower === '::1') {
      return true;
    }
    if (lower.startsWith('fc') || lower.startsWith('fd')) {
      return true;
    }
    if (lower.startsWith('fe80:')) {
      return true;
    }
    if (lower.startsWith('::ffff:')) {
      const v4 = lower.replace('::ffff:', '');
      if (isIPv4(v4)) {
        return isBlockedUrlHost(v4);
      }
    }
    return false;
  }

  return false;
}

function validateAttachmentUrl(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throwInvalid();
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throwInvalid();
  }
  if (isBlockedUrlHost(parsed.hostname)) {
    throwInvalid();
  }
  return parsed.toString();
}

function assertMimeAllowed(mime: string): void {
  if (!ALLOWED_MIME_TYPES.has(mime)) {
    throwInvalid();
  }
}

function extensionForMime(mime: string): string {
  return MIME_TO_EXT[mime] || 'bin';
}

async function recordUploadAudit(
  ctx: AttachmentAuditContext,
  meta: Record<string, unknown>,
  result: string
): Promise<void> {
  try {
    await AuditLog.create({
      action: 'attachment_upload',
      userId: ctx.userId,
      ip: ctx.ip,
      result,
      metadata: {
        ...meta,
        taskId: ctx.taskId,
        commentId: ctx.commentId,
      },
    });
  } catch (error) {
    logger.error('Failed to write attachment audit log', { error });
  }
}

export async function processAttachmentForUpload(
  attachment: RawAttachmentInput,
  audit: AttachmentAuditContext
): Promise<ProcessedAttachment> {
  const baseMeta = {
    declaredMime: attachment.type,
    declaredName: attachment.name,
    sanitizedFilename: sanitizeFilename(attachment.name || '') || 'file',
  };

  if (!attachment.name?.trim() || !attachment.type?.trim()) {
    await recordUploadAudit(audit, { ...baseMeta, reason: 'missing_fields' }, 'reject');
    throwInvalid();
  }

  if (attachment.url && attachment.data) {
    await recordUploadAudit(audit, { ...baseMeta, reason: 'url_and_data' }, 'reject');
    throwInvalid();
  }

  if (attachment.url) {
    const safeUrl = validateAttachmentUrl(attachment.url);
    const safeBaseName = sanitizeFilename(attachment.name) || 'attachment';
    const storedName = `${randomUUID()}-${safeBaseName}`.slice(0, 200);
    const processed: ProcessedAttachment = {
      name: storedName,
      type: attachment.type.trim(),
      size: 0,
      url: safeUrl,
    };
    assertMimeAllowed(processed.type);
    await recordUploadAudit(
      audit,
      {
        ...baseMeta,
        detectedMime: null,
        size: 0,
        urlHost: new URL(safeUrl).hostname,
      },
      'accept_url'
    );
    return processed;
  }

  if (!attachment.data) {
    await recordUploadAudit(audit, { ...baseMeta, reason: 'no_payload' }, 'reject');
    throwInvalid();
  }

  try {
    const { declaredMime, base64 } = extractBase64Payload(attachment.data);
    const buffer = decodeBase64ToBuffer(base64);
    if (buffer.length === 0 || buffer.length > MAX_FILE_SIZE) {
      await recordUploadAudit(
        audit,
        { ...baseMeta, size: buffer.length, reason: 'size' },
        'reject'
      );
      throwInvalid();
    }

    const detected = await FileType.fromBuffer(buffer);
    const declared = attachment.type.trim().toLowerCase();

    let resolvedMime: string;
    if (detected) {
      resolvedMime = detected.mime;
    } else if (TEXTLIKE_MIME.has(declared) && !buffer.includes(0)) {
      resolvedMime = declared;
    } else if (
      buffer.length >= 4 &&
      buffer[0] === 0x50 &&
      buffer[1] === 0x4b &&
      OOXML_MIME.has(declared)
    ) {
      resolvedMime = declared;
    } else {
      await recordUploadAudit(audit, { ...baseMeta, reason: 'unknown_magic' }, 'reject');
      throwInvalid();
    }

    if (resolvedMime !== declared) {
      await recordUploadAudit(
        audit,
        {
          ...baseMeta,
          detectedMime: resolvedMime,
          reason: 'mime_mismatch',
        },
        'reject'
      );
      throwInvalid();
    }

    assertMimeAllowed(resolvedMime);

    const ext = extensionForMime(resolvedMime);
    const storedName = `${randomUUID()}.${ext}`;

    const processed: ProcessedAttachment = {
      name: storedName,
      type: resolvedMime,
      size: buffer.length,
      data: buffer.toString('base64'),
    };

    await recordUploadAudit(
      audit,
      {
        ...baseMeta,
        detectedMime: resolvedMime,
        size: buffer.length,
        sanitizedFilename: storedName,
      },
      'accept_data'
    );

    return processed;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    logger.warn('Attachment processing error', { error });
    await recordUploadAudit(audit, { ...baseMeta, reason: 'exception' }, 'reject');
    throwInvalid();
  }
}
