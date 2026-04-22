import { NextFunction, Request, Response } from 'express';

import { environment } from '../config/environment';
import { logger } from '../utils/logger';

export function requireJobServiceToken(req: Request, res: Response, next: NextFunction): void {
  const expected = environment.get().jobServiceToken;
  if (environment.isProduction() && !expected) {
    logger.warn('JOB_SERVICE_TOKEN is not set; rejecting jobs request in production');
    res.status(503).json({ success: false, error: 'Job endpoints are not configured' });
    return;
  }

  if (!expected) {
    logger.warn('JOB_SERVICE_TOKEN is not set; allowing jobs request in non-production');
    next();
    return;
  }

  const token = req.header('x-service-token');
  if (token !== expected) {
    logger.warn('Rejected jobs request with invalid service token', { ip: req.ip });
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }

  next();
}
