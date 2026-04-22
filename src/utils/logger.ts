import winston from 'winston';

const logLevel = process.env.LOG_LEVEL || 'info';

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let metaStr = '';
    if (Object.keys(meta).length > 0) {
      metaStr = '\n' + JSON.stringify(meta, null, 2);
    }
    return `${timestamp} [${level}]: ${message}${metaStr}`;
  })
);

export const logger = winston.createLogger({
  level: logLevel,
  format: logFormat,
  transports: [
    // Console transport
    new winston.transports.Console({
      format: consoleFormat,
    }),
    // File transport for errors
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: logFormat,
    }),
    // File transport for all logs
    new winston.transports.File({
      filename: 'logs/combined.log',
      format: logFormat,
    }),
  ],
  exceptionHandlers: [
    new winston.transports.File({ filename: 'logs/exceptions.log' })
  ],
  rejectionHandlers: [
    new winston.transports.File({ filename: 'logs/rejections.log' })
  ],
});

// Create logs directory if it doesn't exist
import * as fs from 'fs';
import * as path from 'path';

const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

/*
 * Alert runbook (map log queries to your stack: ELK / Datadog / CloudWatch):
 * - graphql_operation: rate by ip where userId is null > 100/min from one IP (abuse / scraping).
 * - graphql_operation: high cardinality of distinct userId per actor (service account) in 5m (enumeration).
 * - Winston auth/OTP logs: verifyOTP failures per email > 5 / 15m (credential stuffing); tune via mail provider metrics too.
 * - HTTP 401 on /jobs/* or missing X-Service-Token (see request logger / access logs).
 */

