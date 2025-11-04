import { createModule, gql } from 'graphql-modules';
import * as jwt from 'jsonwebtoken';
import { User } from '../../../models/User';
import { AppError } from '../../../middleware';
import { logger } from '../../../utils/logger';
import { environment } from '../../../config/environment';

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

    extend type Query {
      verifyToken: AuthUser
    }

    extend type Mutation {
      login(input: LoginInput!): AuthPayload!
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
    },
  },
});

