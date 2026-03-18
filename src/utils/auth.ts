import * as jwt from 'jsonwebtoken';

import { environment } from '../config/environment';
import { AppError } from '../middleware';
import { User } from '../models/User';

export interface AuthenticatedUser {
  userId: string;
  email: string;
  username: string;
  gitlabId?: number;
  department: string;
  role: string;
  isSuperAdmin: boolean;
}

export interface GraphQLContext {
  req?: {
    headers?: {
      authorization?: string;
    };
  };
  currentUser: AuthenticatedUser | null;
}

interface TokenPayload {
  userId: string;
  email: string;
  username: string;
  gitlabId?: number;
}

function extractBearerToken(authorizationHeader?: string): string | null {
  if (!authorizationHeader?.startsWith('Bearer ')) {
    return null;
  }

  return authorizationHeader.slice(7);
}

function getTokenFromConnectionParams(connectionParams?: Record<string, unknown>): string | null {
  const authorization = connectionParams?.authorization;
  if (typeof authorization === 'string') {
    return extractBearerToken(authorization) || authorization;
  }

  const authToken = connectionParams?.authToken;
  if (typeof authToken === 'string') {
    return extractBearerToken(authToken) || authToken;
  }

  return null;
}

export async function resolveCurrentUserFromToken(token: string | null): Promise<AuthenticatedUser | null> {
  if (!token) {
    return null;
  }

  try {
    const decoded = jwt.verify(token, environment.JWT_SECRET) as TokenPayload;
    const user = await User.findById(decoded.userId)
      .select('_id email username gitlabId department role isActive isSuperAdmin')
      .lean();

    if (!user) {
      throw new AppError('User not found', 404);
    }

    if (!user.isActive) {
      throw new AppError('User account is inactive', 403);
    }

    return {
      userId: user._id.toString(),
      email: user.email,
      username: user.username,
      gitlabId: user.gitlabId,
      department: user.department,
      role: user.role,
      isSuperAdmin: user.isSuperAdmin === true,
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    if (error instanceof Error && error.name === 'TokenExpiredError') {
      throw new AppError('Token expired', 401);
    }

    throw new AppError('Invalid token', 401);
  }
}

export async function buildGraphQLContext(options: {
  req?: {
    headers?: {
      authorization?: string;
    };
  };
  connectionParams?: Record<string, unknown>;
}): Promise<GraphQLContext> {
  const token =
    extractBearerToken(options.req?.headers?.authorization) ||
    getTokenFromConnectionParams(options.connectionParams);

  return {
    req: options.req,
    currentUser: await resolveCurrentUserFromToken(token),
  };
}

export function requireCurrentUser(context: GraphQLContext): AuthenticatedUser {
  if (!context.currentUser) {
    throw new AppError('Not authenticated', 401);
  }

  return context.currentUser;
}
