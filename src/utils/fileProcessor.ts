import { AppError } from '../middleware';
import { logger } from './logger';

export interface FileValidationResult {
  isValid: boolean;
  error?: string;
  mimeType?: string;
  size?: number;
}

// Allowed MIME types for file uploads
const ALLOWED_MIME_TYPES = [
  // Images
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  // Archives
  'application/zip',
  'application/x-zip-compressed',
  'application/x-rar-compressed',
];

// Maximum file size: 5MB
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB in bytes

/**
 * Validates base64 encoded file data
 * @param base64Data - The base64 encoded file data (with or without data URI prefix)
 * @returns Validation result with error message if invalid
 */
export function validateBase64File(base64Data: string): FileValidationResult {
  try {
    // Check if data is empty
    if (!base64Data || base64Data.trim().length === 0) {
      return {
        isValid: false,
        error: 'File data is empty'
      };
    }

    // Extract MIME type and base64 data from data URI
    let mimeType: string | undefined;
    let pureBase64: string;

    if (base64Data.startsWith('data:')) {
      // Extract MIME type from data URI (e.g., "data:image/png;base64,...")
      const matches = base64Data.match(/^data:([^;]+);base64,(.+)$/);
      if (!matches) {
        return {
          isValid: false,
          error: 'Invalid data URI format'
        };
      }
      mimeType = matches[1];
      pureBase64 = matches[2];
    } else {
      // Assume it's pure base64 without data URI prefix
      pureBase64 = base64Data;
    }

    // Validate base64 format
    const base64Regex = /^[A-Za-z0-9+/]+={0,2}$/;
    if (!base64Regex.test(pureBase64)) {
      return {
        isValid: false,
        error: 'Invalid base64 encoding'
      };
    }

    // Calculate file size from base64 string
    // Base64 encoding increases size by ~33%, so we need to calculate original size
    const padding = (pureBase64.match(/=/g) || []).length;
    const size = Math.floor((pureBase64.length * 3) / 4) - padding;

    // Validate file size
    if (size > MAX_FILE_SIZE) {
      return {
        isValid: false,
        error: `File size (${formatFileSize(size)}) exceeds maximum allowed size (${formatFileSize(MAX_FILE_SIZE)})`
      };
    }

    // Validate MIME type if present
    if (mimeType && !ALLOWED_MIME_TYPES.includes(mimeType)) {
      return {
        isValid: false,
        error: `File type ${mimeType} is not allowed`
      };
    }

    logger.info('File validation successful', { mimeType, size });

    return {
      isValid: true,
      mimeType,
      size
    };
  } catch (error) {
    logger.error('Error validating base64 file', { error });
    return {
      isValid: false,
      error: 'Failed to validate file data'
    };
  }
}

/**
 * Extracts MIME type from base64 data URI
 * @param base64Data - The base64 encoded file data
 * @returns MIME type or null if not found
 */
export function extractMimeType(base64Data: string): string | null {
  if (base64Data.startsWith('data:')) {
    const matches = base64Data.match(/^data:([^;]+);base64,/);
    return matches ? matches[1] : null;
  }
  return null;
}

/**
 * Extracts pure base64 data from data URI
 * @param base64Data - The base64 encoded file data (with or without data URI prefix)
 * @returns Pure base64 string
 */
export function extractBase64Data(base64Data: string): string {
  if (base64Data.startsWith('data:')) {
    const matches = base64Data.match(/^data:[^;]+;base64,(.+)$/);
    return matches ? matches[1] : base64Data;
  }
  return base64Data;
}

/**
 * Calculates file size from base64 string
 * @param base64Data - The base64 encoded file data (with or without data URI prefix)
 * @returns File size in bytes
 */
export function calculateBase64FileSize(base64Data: string): number {
  const pureBase64 = extractBase64Data(base64Data);
  const padding = (pureBase64.match(/=/g) || []).length;
  return Math.floor((pureBase64.length * 3) / 4) - padding;
}

/**
 * Formats file size to human-readable string
 * @param bytes - File size in bytes
 * @returns Formatted size string (e.g., "1.5 MB")
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Gets file extension from MIME type
 * @param mimeType - MIME type
 * @returns File extension (e.g., "jpg", "pdf")
 */
export function getFileExtensionFromMimeType(mimeType: string): string {
  const mimeToExt: { [key: string]: string } = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.ms-powerpoint': 'ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    'text/plain': 'txt',
    'text/csv': 'csv',
    'application/zip': 'zip',
    'application/x-zip-compressed': 'zip',
    'application/x-rar-compressed': 'rar',
  };

  return mimeToExt[mimeType] || 'bin';
}

/**
 * Validates and processes file attachment input
 * @param attachment - Attachment object with name, data, type, size
 * @returns Processed attachment or throws error
 */
export function processAttachment(attachment: any): any {
  // Validate required fields
  if (!attachment.name || !attachment.type) {
    throw new AppError('Attachment must have name and type', 400);
  }

  // Validate base64 data if provided
  if (attachment.data) {
    const validation = validateBase64File(attachment.data);
    if (!validation.isValid) {
      throw new AppError(validation.error || 'Invalid file data', 400);
    }

    // Auto-populate size and type from validation if not provided
    if (!attachment.size && validation.size) {
      attachment.size = validation.size;
    }

    if (validation.mimeType && validation.mimeType !== attachment.type) {
      logger.warn('MIME type mismatch', {
        provided: attachment.type,
        detected: validation.mimeType
      });
    }
  }

  // Validate file size if provided
  if (attachment.size && attachment.size > MAX_FILE_SIZE) {
    throw new AppError(
      `File size (${formatFileSize(attachment.size)}) exceeds maximum allowed size (${formatFileSize(MAX_FILE_SIZE)})`,
      400
    );
  }

  // Validate MIME type
  if (!ALLOWED_MIME_TYPES.includes(attachment.type)) {
    throw new AppError(`File type ${attachment.type} is not allowed`, 400);
  }

  return attachment;
}

