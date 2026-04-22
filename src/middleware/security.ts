import cors from 'cors';
import helmet from 'helmet';

import { environment } from '../config/environment';

export const securityMiddleware = helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
  crossOriginEmbedderPolicy: false,
  strictTransportSecurity:
    process.env.NODE_ENV === 'production'
      ? {
          maxAge: 63072000,
          includeSubDomains: true,
          preload: true,
        }
      : false,
});

export const corsMiddleware = cors({
  origin: (origin, callback) => {
    const allowed = environment.get().allowedOrigins;
    if (!origin || allowed.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'Apollo-Require-Preflight',
    'X-Apollo-Operation-Name',
    'X-Codex-Plugin-Token',
    'X-Service-Token',
  ],
});

