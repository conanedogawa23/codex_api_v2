import { createModule, gql } from 'graphql-modules';
import * as jwt from 'jsonwebtoken';
import { User } from '../../../models/User';
import { AppError } from '../../../middleware';
import { logger } from '../../../utils/logger';
import { environment } from '../../../config/environment';
import { emailService } from '../../../utils/emailService';
import { generateOTP, getOTPExpiry, isOTPExpired, hashOTP, verifyOTP, OTP_CONFIG } from '../../../utils/otpUtils';

// JWT secret from environment or default for development
const JWT_SECRET = environment.JWT_SECRET;
const JWT_EXPIRES_IN = environment.JWT_EXPIRES_IN;

interface TokenPayload {
  userId: string;
  email: string;
  username: string;
  gitlabId?: number;
}

export const authModule = createModule({
  id: 'auth',
  typeDefs: gql`
    type AuthPayload {
      token: String!
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
    }

    extend type Mutation {
      login(input: LoginInput!): AuthPayload!
      requestOTP(input: RequestOTPInput!): RequestOTPResponse!
      verifyOTP(input: VerifyOTPInput!): AuthPayload!
    }
  `,
  resolvers: {
    Query: {
      verifyToken: async (_: any, __: any, context: any) => {
        const authHeader = context.req?.headers?.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          // Return null instead of throwing error to allow admin mode
          logger.info('verifyToken called without authentication - returning null (admin mode)');
          return null;
        }

        const token = authHeader.substring(7);

        try {
          const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload;

          // Fetch fresh user data from database
          const user = await User.findById(decoded.userId).lean();

          if (!user) {
            throw new AppError('User not found', 404);
          }

          if (!user.isActive) {
            throw new AppError('User account is inactive', 403);
          }

          logger.info('Token verified successfully', { userId: user._id.toString() });

          return {
            userId: user._id.toString(),
            email: user.email,
            username: user.username,
            name: user.name,
            gitlabId: user.gitlabId,
            avatar: user.avatar,
            department: user.department,
            role: user.role,
          };
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
    },

    Mutation: {
      login: async (_: any, { input }: { input: { email: string } }) => {
        const { email } = input;

        logger.info('Login attempt', { email });

        // Find user by email
        const user = await User.findByEmail(email);

        if (!user) {
          logger.warn('Login failed: User not found', { email });
          throw new AppError('User not found. Please contact your administrator.', 404);
        }

        if (!user.isActive) {
          logger.warn('Login failed: User inactive', { email });
          throw new AppError('Your account is inactive. Please contact your administrator.', 403);
        }

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

        logger.info('Login successful', {
          userId: user._id.toString(),
          email: user.email,
          gitlabId: user.gitlabId,
        });

        return {
          token,
          user: {
            userId: user._id.toString(),
            email: user.email,
            username: user.username,
            name: user.name,
            gitlabId: user.gitlabId,
            avatar: user.avatar,
            department: user.department,
            role: user.role,
          },
        };
      },

      requestOTP: async (_: any, { input }: { input: { email: string } }) => {
        const { email } = input;

        logger.info('OTP request attempt', { email });

        // Find user by email
        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user) {
          logger.warn('OTP request failed: User not found', { email });
          throw new AppError('User not found. Please contact your administrator.', 404);
        }

        if (!user.isActive) {
          logger.warn('OTP request failed: User inactive', { email });
          throw new AppError('Your account is inactive. Please contact your administrator.', 403);
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

        return {
          success: true,
          message: 'OTP sent to your email address. Please check your inbox.',
          expiresIn: OTP_CONFIG.EXPIRY_MINUTES * 60, // in seconds
        };
      },

      verifyOTP: async (_: any, { input }: { input: { email: string; otp: string } }) => {
        const { email, otp } = input;

        logger.info('OTP verification attempt', { email });

        // Find user by email
        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user) {
          logger.warn('OTP verification failed: User not found', { email });
          throw new AppError('User not found. Please contact your administrator.', 404);
        }

        if (!user.isActive) {
          logger.warn('OTP verification failed: User inactive', { email });
          throw new AppError('Your account is inactive. Please contact your administrator.', 403);
        }

        // Check if OTP exists
        if (!user.otp || !user.otpExpiry) {
          logger.warn('OTP verification failed: No OTP found', { email });
          throw new AppError('No OTP found. Please request a new OTP.', 400);
        }

        // Check if OTP is expired
        if (isOTPExpired(user.otpExpiry)) {
          logger.warn('OTP verification failed: OTP expired', { email });
          // Clear expired OTP
          user.otp = undefined;
          user.otpExpiry = undefined;
          user.otpAttempts = 0;
          await user.save();
          throw new AppError('OTP has expired. Please request a new OTP.', 400);
        }

        // Verify OTP
        const isValid = verifyOTP(otp, user.otp);

        if (!isValid) {
          logger.warn('OTP verification failed: Invalid OTP', { email });
          throw new AppError('Invalid OTP. Please check and try again.', 400);
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

        logger.info('OTP verification successful, login granted', {
          userId: user._id.toString(),
          email: user.email,
          gitlabId: user.gitlabId,
        });

        return {
          token,
          user: {
            userId: user._id.toString(),
            email: user.email,
            username: user.username,
            name: user.name,
            gitlabId: user.gitlabId,
            avatar: user.avatar,
            department: user.department,
            role: user.role,
          },
        };
      },
    },
  },
});

