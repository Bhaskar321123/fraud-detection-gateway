import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

// Load .env from project root
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

/**
 * Zod schema enforcing strong typing on every environment variable.
 * Parsing fails fast at startup if anything is missing or malformed.
 */
const envSchema = z.object({
  // ── Server ──────────────────────────────────────────────
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'debug', 'silly']).default('info'),

  // ── Redis ───────────────────────────────────────────────
  REDIS_HOST: z.string().min(1).default('127.0.0.1'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().default(''),
  REDIS_DB: z.coerce.number().int().min(0).default(0),
  REDIS_KEY_PREFIX: z.string().default('fdg:'),

  // ── PostgreSQL ──────────────────────────────────────────
  PG_HOST: z.string().min(1).default('127.0.0.1'),
  PG_PORT: z.coerce.number().int().positive().default(5432),
  PG_USER: z.string().min(1).default('fdg_admin'),
  PG_PASSWORD: z.string().default('changeme'),
  PG_DATABASE: z.string().min(1).default('fraud_gateway'),
  PG_POOL_MIN: z.coerce.number().int().min(0).default(2),
  PG_POOL_MAX: z.coerce.number().int().positive().default(10),

  // ── Risk Engine ─────────────────────────────────────────
  RISK_THRESHOLD_BLOCK: z.coerce.number().int().min(0).max(100).default(80),
  RISK_THRESHOLD_WARN: z.coerce.number().int().min(0).max(100).default(50),

  // ── Rate Limiting (Token Bucket) ────────────────────────
  RATE_LIMIT_MAX_TOKENS: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_REFILL_RATE: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_REFILL_INTERVAL_MS: z.coerce.number().int().positive().default(1000),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),

  // ── Geo-Shift Detection ─────────────────────────────────
  GEO_SHIFT_MAX_SPEED_KMH: z.coerce.number().positive().default(1000),
  GEO_SHIFT_WINDOW_MS: z.coerce.number().int().positive().default(300000),

  // ── Payload Rules ───────────────────────────────────────
  MAX_PAYLOAD_SIZE_BYTES: z.coerce.number().int().positive().default(1_048_576),

  // ── Proxy / Upstream ────────────────────────────────────
  UPSTREAM_TARGET: z.string().url().default('http://localhost:4000'),

  // ── Fail Mode ───────────────────────────────────────────
  FAIL_MODE: z.enum(['open', 'secure']).default('open'),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Parse and freeze environment config.
 * Throws a descriptive ZodError at startup if validation fails.
 */
function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  • ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    throw new Error(
      `\n❌ Environment validation failed:\n${formatted}\n\nCopy .env.example → .env and fill in required values.\n`
    );
  }

  return Object.freeze(result.data);
}

/** Singleton frozen config object */
export const env: Env = loadEnv();
