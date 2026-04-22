import { createModule, gql } from 'graphql-modules';
import * as jwt from 'jsonwebtoken';

import { environment } from '../../../config/environment';
import { AppError } from '../../../middleware';
import { User } from '../../../models/User';
import { getRequestClientIp, recordAuditLogEntry } from '../../../utils/auditLogWrite';
import {
  getPermissionsForAccessRole,
  normalizeAccessRole,
} from '../../../utils/accessControl';
import {
  GraphQLContext,
  clearSessionCookie,
  getAuthEnumerationSafeMessage,
  requireCurrentUser,
  setSessionCookie,
} from '../../../utils/auth';
import { emailService } from '../../../utils/emailService';
import { logger } from '../../../utils/logger';
import {
  generateOTP,
  getOTPExpiry,
  hashOTP,
  isOTPExpired,
  OTP_CONFIG,
  verifyOTP,
} from '../../../utils/otpUtils';

// JWT secret from environment or default for development
const JWT_SECRET = environment.JWT_SECRET;
const JWT_EXPIRES_IN = environment.JWT_EXPIRES_IN;

interface TokenPayload {
  userId: string;
  email: string;
  username: string;
  gitlabId?: number;
}

/**
 * AuthUser is intentionally broad: the web app reads role, permissions, and super-admin flags on verifyToken/me.
 * Field-minimization for anonymous or narrow callers is a future hardening step (PublicUser / split queries).
 */
function toAuthUser(user: any) {
  return {
    userId: user._id?.toString() || user.userId,
    email: user.email,
    username: user.username,
    name: user.name,
    gitlabId: user.gitlabId,
    avatar: user.avatar,
    department: user.department,
    role: user.role,
    accessRole: normalizeAccessRole(user.accessRole),
    permissions: getPermissionsForAccessRole(user.accessRole, user.isSuperAdmin === true),
    isSuperAdmin: user.isSuperAdmin === true,
  };
}

export const authModule = createModule({
  id: 'auth',
  typeDefs: gql`
    type AuthPayload {
      token: String
      user: AuthUser!
    }

    type AuthUser {
      userId: ID!
      email: String!
      username: String!
      name: String!
      gitlabId: Int
      avatar: String
      department: String!
      role: String!
      accessRole: AccessRole!
      permissions: [Permission!]!
      isSuperAdmin: Boolean!
    }

    input LoginInput {
      email: String!
    }

    input RequestOTPInput {
      email: String!
    }

    input VerifyOTPInput {
      email: String!
      otp: String!
    }

    type RequestOTPResponse {
      success: Boolean!
      message: String!
      expiresIn: Int!
    }

    extend type Query {
      verifyToken: AuthUser
      me(forceSync: Boolean): AuthUser
    }

    extend type Mutation {
      login(input: LoginInput!): AuthPayload!
      requestOTP(input: RequestOTPInput!): RequestOTPResponse!
      verifyOTP(input: VerifyOTPInput!): AuthPayload!
      logout: Boolean!
    }
  `,
  resolvers: {
    Query: {
      verifyToken: async (_: any, __: any, context: GraphQLContext) => {
        if (!context.currentUser) {
          logger.info('verifyToken called without authentication - returning null');
          return null;
        }

        try {
          const user = await User.findById(context.currentUser.userId).lean();

          if (!user) {
            throw new AppError('User not found', 404);
          }

          if (!user.isActive) {
            throw new AppError('User account is inactive', 403);
          }

          logger.info('Token verified successfully', { userId: user._id.toString() });

          return toAuthUser(user);
        } catch (error: any) {
          if (error.name === 'JsonWebTokenError') {
            throw new AppError('Invalid token', 401);
          }
          if (error.name === 'TokenExpiredError') {
            throw new AppError('Token expired', 401);
          }
          throw error;
        }
      },
      me: async (_: any, __: any, context: GraphQLContext) => {
        const currentUser = requireCurrentUser(context);
        const user = await User.findById(currentUser.userId).lean();

        if (!user) {
          throw new AppError('User not found', 404);
        }

        if (!user.isActive) {
          throw new AppError('User account is inactive', 403);
        }

        return toAuthUser(user);
      },
    },

    Mutation: {
      login: async (_: any, { input }: { input: { email: string } }, context: GraphQLContext) => {
        const { email } = input;

        logger.info('Login attempt', { email });

        const user = await User.findByEmail(email);

        if (!user || !user.isActive) {
          logger.warn('Login failed', { email });
          throw new AppError(getAuthEnumerationSafeMessage(), 401);
        }

        const tokenPayload: TokenPayload = {
          userId: user._id.toString(),
          email: user.email,
          username: user.username,
          gitlabId: user.gitlabId,
        };

        const token = jwt.sign(
          tokenPayload,
          JWT_SECRET,
          { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions
        );

        if (context.res) {
          setSessionCookie(context.res, token);
        }

        logger.info('Login successful', {
          userId: user._id.toString(),
          email: user.email,
          gitlabId: user.gitlabId,
        });

        recordAuditLogEntry({
          action: 'auth_login',
          ip: getRequestClientIp(context.req),
          metadata: { gitlabId: user.gitlabId },
          result: 'success',
          userId: user._id.toString(),
        });

        return {
          token,
          user: toAuthUser(user),
        };
      },

      requestOTP: async (_: any, { input }: { input: { email: string } }, context: GraphQLContext) => {
        const { email } = input;

        logger.info('OTP request attempt', { email });

        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user || !user.isActive) {
          logger.warn('OTP request failed', { email });
          throw new AppError(getAuthEnumerationSafeMessage(), 401);
        }

        // Check if user is locked due to too many attempts
        if (user.otpAttempts && user.otpAttempts >= OTP_CONFIG.MAX_ATTEMPTS) {
          const lockDuration = 15; // minutes
          if (user.otpExpiry && (new Date().getTime() - user.otpExpiry.getTime()) < lockDuration * 60 * 1000) {
            logger.warn('OTP request failed: Too many attempts', { email });
            throw new AppError('Too many OTP requests. Please try again later.', 429);
          } else {
            // Reset attempts after lock duration
            user.otpAttempts = 0;
          }
        }

        // Generate OTP
        const otp = generateOTP();
        const hashedOTP = hashOTP(otp);
        const otpExpiry = getOTPExpiry();

        // Update user with OTP
        user.otp = hashedOTP;
        user.otpExpiry = otpExpiry;
        user.otpAttempts = (user.otpAttempts || 0) + 1;
        await user.save();

        // Send OTP email
        const emailSent = await emailService.sendOTPEmail(user.email, otp, user.name);

        if (!emailSent) {
          logger.error('Failed to send OTP email', { email });
          throw new AppError('Failed to send OTP email. Please try again later.', 500);
        }

        logger.info('OTP sent successfully', {
          email,
          userId: user._id.toString(),
          expiresAt: otpExpiry.toISOString(),
        });

        recordAuditLogEntry({
          action: 'auth_request_otp',
          ip: getRequestClientIp(context.req),
          metadata: { expiresAt: otpExpiry.toISOString() },
          result: 'success',
          userId: user._id.toString(),
        });

        return {
          success: true,
          message: 'OTP sent to your email address. Please check your inbox.',
          expiresIn: OTP_CONFIG.EXPIRY_MINUTES * 60, // in seconds
        };
      },

      verifyOTP: async (
        _: any,
        { input }: { input: { email: string; otp: string } },
        context: GraphQLContext
      ) => {
        const { email, otp } = input;

        logger.info('OTP verification attempt', { email });

        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user || !user.isActive) {
          logger.warn('OTP verification failed', { email });
          throw new AppError(getAuthEnumerationSafeMessage(), 401);
        }

        if (!user.otp || !user.otpExpiry) {
          logger.warn('OTP verification failed: No OTP found', { email });
          throw new AppError(getAuthEnumerationSafeMessage(), 401);
        }

        if (isOTPExpired(user.otpExpiry)) {
          logger.warn('OTP verification failed: OTP expired', { email });
          user.otp = undefined;
          user.otpExpiry = undefined;
          user.otpAttempts = 0;
          await user.save();
          throw new AppError(getAuthEnumerationSafeMessage(), 401);
        }

        const isValid = verifyOTP(otp, user.otp);

        if (!isValid) {
          logger.warn('OTP verification failed: Invalid OTP', { email });
          throw new AppError(getAuthEnumerationSafeMessage(), 401);
        }

        // Clear OTP after successful verification
        user.otp = undefined;
        user.otpExpiry = undefined;
        user.otpAttempts = 0;
        user.emailVerified = true;
        await user.save();

        // Generate JWT token
        const tokenPayload: TokenPayload = {
          userId: user._id.toString(),
          email: user.email,
          username: user.username,
          gitlabId: user.gitlabId,
        };

        const token = jwt.sign(
          tokenPayload,
          JWT_SECRET,
          { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions
        );

        if (context.res) {
          setSessionCookie(context.res, token);
        }

        logger.info('OTP verification successful, login granted', {
          userId: user._id.toString(),
          email: user.email,
          gitlabId: user.gitlabId,
        });

        recordAuditLogEntry({
          action: 'auth_verify_otp',
          ip: getRequestClientIp(context.req),
          metadata: { gitlabId: user.gitlabId },
          result: 'success',
          userId: user._id.toString(),
        });

        return {
          token,
          user: toAuthUser(user),
        };
      },

      logout: async (_: unknown, __: unknown, context: GraphQLContext) => {
        const currentUser = requireCurrentUser(context);
        if (!context.res) {
          throw new AppError('Not authenticated', 401);
        }
        clearSessionCookie(context.res);
        logger.info('User logged out', { userId: currentUser.userId });
        recordAuditLogEntry({
          action: 'auth_logout',
          ip: getRequestClientIp(context.req),
          result: 'success',
          userId: currentUser.userId,
        });
        return true;
      },
    },
  },
});

