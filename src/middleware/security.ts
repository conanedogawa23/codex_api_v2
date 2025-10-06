import helmet from 'helmet';
import cors from 'cors';
import { environment } from '../config/environment';

export const securityMiddleware = helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
  crossOriginEmbedderPolicy: false,
});

export const corsMiddleware = cors({
  origin: (origin, callback) => {
    const config = environment.get();
    const allowedOrigins = config.allowedOrigins;
    
    // Allow requests with no origin (like mobile apps, Postman, curl)
    if (!origin) {
      return callback(null, true);
    }

    // In development, allow all origins by default if no specific origins are configured
    if (config.nodeEnv === 'development' && allowedOrigins.length === 1 && allowedOrigins[0] === 'http://localhost:3000') {
      return callback(null, true);
    }

    // Check if origin is in allowed list
    if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});

