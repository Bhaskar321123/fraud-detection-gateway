import winston from 'winston';
import { env } from './env';

const { combine, timestamp, printf, colorize, errors, json } = winston.format;

/**
 * Human-readable format for development.
 */
const devFormat = combine(
  colorize({ all: true }),
  timestamp({ format: 'HH:mm:ss.SSS' }),
  errors({ stack: true }),
  printf(({ timestamp: ts, level, message, stack, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    const stackStr = stack ? `\n${String(stack)}` : '';
    return `${String(ts)} [${level}] ${String(message)}${metaStr}${stackStr}`;
  })
);

/**
 * Structured JSON format for production log aggregators.
 */
const prodFormat = combine(
  timestamp({ format: 'ISO' }),
  errors({ stack: true }),
  json()
);

/**
 * Singleton Winston logger instance.
 *
 * - Development: colorized, human-readable console output.
 * - Production:  structured JSON to stdout (for Docker / log shippers).
 */
export const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  defaultMeta: { service: 'fraud-detection-gateway' },
  format: env.NODE_ENV === 'production' ? prodFormat : devFormat,
  transports: [
    new winston.transports.Console({
      handleExceptions: true,
      handleRejections: true,
    }),
  ],
  exitOnError: false,
});

/**
 * Stream adapter for Express/Morgan HTTP request logging.
 */
export const logStream = {
  write: (message: string): void => {
    logger.http(message.trim());
  },
};
