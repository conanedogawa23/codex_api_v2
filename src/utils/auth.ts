import { parse as parseCookie } from 'cookie';
import type { Request, Response } from 'express';
import * as jwt from 'jsonwebtoken';

import { environment } from '../config/environment';
import { getSessionCookieName } from '../config/sessionCookie';
import { AppError } from '../middleware';
import { User } from '../models/User';
import {
  type AccessRole,
  type Permission,
  getPermissionsForAccessRole,
  normalizeAccessRole,
} from './accessControl';
import { logger } from './logger';

export interface AuthenticatedUser {
  userId: string;
  email: string;
  username: string;
  gitlabId?: number;
  department: string;
  role: string;
  accessRole: AccessRole;
  permissions: Permission[];
  isSuperAdmin: boolean;
}

export interface GraphQLContext {
  req?: Request;
  res?: Response;
  currentUser: AuthenticatedUser | null;
  pluginServiceAuthenticated: boolean;
}

interface TokenPayload {
  userId: string;
  email: string;
  username: string;
  gitlabId?: number;
}

const AUTH_ENUMERATION_SAFE_MESSAGE = 'Invalid credentials';

export function getAuthEnumerationSafeMessage(): string {
  return AUTH_ENUMERATION_SAFE_MESSAGE;
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

function readSessionCookieFromHeader(cookieHeader?: string): string | null {
  if (!cookieHeader) {
    return null;
  }
  const cookies = parseCookie(cookieHeader);
  const name = getSessionCookieName();
  const value = cookies[name];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function pluginServiceAuthenticatedFromRequest(req?: Request): boolean {
  const expected = environment.get().pluginGraphqlServiceToken;
  if (!expected || !req) {
    return false;
  }
  const header = req.header('x-codex-plugin-token');
  return header === expected;
}

function getCookieMaxAgeSecondsFromJwt(token: string): number {
  const decoded = jwt.decode(token) as { exp?: number; iat?: number } | null;
  if (decoded?.exp != null && decoded.iat != null) {
    return Math.max(1, decoded.exp - decoded.iat);
  }
  return 7 * 24 * 60 * 60;
}

/**
 * Sets the httpOnly session cookie. Combined CSRF posture: SameSite=Lax, Path=/, Secure in production,
 * plus Apollo csrfPrevention and Origin allowlist on /graphql — do not remove any single layer.
 */
export function setSessionCookie(res: Response, token: string): void {
  const name = getSessionCookieName();
  const maxAgeSeconds = getCookieMaxAgeSecondsFromJwt(token);
  res.cookie(name, token, {
    httpOnly: true,
    maxAge: maxAgeSeconds * 1000,
    path: '/',
    sameSite: 'lax',
    secure: environment.isProduction(),
  });
}

export function clearSessionCookie(res: Response): void {
  const name = getSessionCookieName();
  res.clearCookie(name, {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: environment.isProduction(),
  });
}

export async function resolveCurrentUserFromToken(token: string | null): Promise<AuthenticatedUser | null> {
  if (!token) {
    return null;
  }

  try {
    const decoded = jwt.verify(token, environment.JWT_SECRET) as TokenPayload;
    const user = await User.findById(decoded.userId)
      .select('_id email username gitlabId department role accessRole isActive isSuperAdmin')
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
      accessRole: normalizeAccessRole(user.accessRole),
      permissions: getPermissionsForAccessRole(user.accessRole, user.isSuperAdmin === true),
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
  req?: Request;
  res?: Response;
  cookieHeader?: string;
  connectionParams?: Record<string, unknown>;
}): Promise<GraphQLContext> {
  const pluginOk = pluginServiceAuthenticatedFromRequest(options.req);
  const cookieHeader =
    options.cookieHeader ||
    (typeof options.req?.headers.cookie === 'string' ? options.req.headers.cookie : undefined);
  const cookieToken = readSessionCookieFromHeader(cookieHeader);
  const bearerFromHeader = extractBearerToken(options.req?.headers.authorization);
  const bearerFromWs = getTokenFromConnectionParams(options.connectionParams);
  const bearerToken = bearerFromHeader || bearerFromWs;
  const token = cookieToken || bearerToken;

  const currentUser = await resolveCurrentUserFromToken(token);
  if (currentUser && bearerToken && !cookieToken) {
    logger.info('graphql_auth_bearer_header', {
      userId: currentUser.userId,
      userAgent: options.req?.headers['user-agent'],
    });
  }

  return {
    req: options.req,
    res: options.res,
    currentUser,
    pluginServiceAuthenticated: pluginOk,
  };
}

export function requireCurrentUser(context: GraphQLContext): AuthenticatedUser {
  if (!context.currentUser) {
    throw new AppError('Not authenticated', 401);
  }

  return context.currentUser;
}

export function requireUserOrPluginService(context: GraphQLContext): void {
  if (context.currentUser || context.pluginServiceAuthenticated) {
    return;
  }
  throw new AppError('Not authenticated', 401);
}
