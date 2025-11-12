import crypto from 'crypto';

/**
 * Generate a random 6-digit OTP
 */
export function generateOTP(): string {
  const otp = crypto.randomInt(100000, 999999);
  return otp.toString();
}

/**
 * Get OTP expiry time (10 minutes from now)
 */
export function getOTPExpiry(): Date {
  const expiry = new Date();
  expiry.setMinutes(expiry.getMinutes() + 10);
  return expiry;
}

/**
 * Check if OTP is expired
 */
export function isOTPExpired(expiryDate: Date): boolean {
  return new Date() > expiryDate;
}

/**
 * Hash OTP for secure storage
 */
export function hashOTP(otp: string): string {
  return crypto.createHash('sha256').update(otp).digest('hex');
}

/**
 * Verify OTP against hashed value
 */
export function verifyOTP(inputOTP: string, hashedOTP: string): boolean {
  const hashedInput = hashOTP(inputOTP);
  return hashedInput === hashedOTP;
}

/**
 * Constants for OTP configuration
 */
export const OTP_CONFIG = {
  EXPIRY_MINUTES: 10,
  MAX_ATTEMPTS: 5,
  LENGTH: 6,
} as const;

