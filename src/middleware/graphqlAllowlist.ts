import { NextFunction, Request, Response } from 'express';

import { environment } from '../config/environment';

function normalizeOrigin(origin: string | undefined): string | null {
  if (!origin || origin === 'null') {
    return null;
  }
  return origin;
}

export function isOriginAllowedForGraphql(originHeader: string | undefined): boolean {
  const allowed = environment.get().allowedOrigins;
  const origin = normalizeOrigin(originHeader);
  if (!origin) {
    return true;
  }
  return allowed.includes(origin);
}

/**
 * Rejects cross-origin GraphQL requests that are not in the CORS allowlist.
 * Same-origin browser requests often omit Origin; those are allowed.
 */
export function graphqlOriginAllowlistMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (req.path !== '/graphql') {
    next();
    return;
  }

  const origin = req.header('origin');
  if (!isOriginAllowedForGraphql(origin)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  next();
}
