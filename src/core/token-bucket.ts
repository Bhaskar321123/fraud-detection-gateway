import { redis, TOKEN_BUCKET_LUA } from '../config/redis';
import { env } from '../config/env';
import { logger } from '../config/logger';

/**
 * Result of a token bucket consumption attempt.
 */
export interface TokenBucketResult {
  /** Whether the request was allowed (token consumed) */
  allowed: boolean;

  /** Tokens remaining in the bucket after this request */
  remainingTokens: number;

  /** Milliseconds until the next token is available (0 if allowed) */
  retryAfterMs: number;
}

/**
 * Redis-backed Token Bucket rate limiter.
 *
 * Uses an atomic Lua script to guarantee correctness under high concurrency.
 * Each unique key (typically IP or user ID) gets its own independent bucket.
 *
 * Bucket parameters are pulled from env config but can be overridden per call.
 */
export async function consumeToken(
  key: string,
  options?: {
    maxTokens?: number;
    refillRate?: number;
    refillIntervalMs?: number;
  }
): Promise<TokenBucketResult> {
  const maxTokens = options?.maxTokens ?? env.RATE_LIMIT_MAX_TOKENS;
  const refillRate = options?.refillRate ?? env.RATE_LIMIT_REFILL_RATE;
  const refillIntervalMs = options?.refillIntervalMs ?? env.RATE_LIMIT_REFILL_INTERVAL_MS;
  const nowMs = Date.now();

  try {
    const result = await redis.eval(
      TOKEN_BUCKET_LUA,
      1,                    // number of KEYS
      `rl:${key}`,          // KEYS[1] — bucket key (prefix added by ioredis)
      String(maxTokens),    // ARGV[1]
      String(refillRate),   // ARGV[2]
      String(refillIntervalMs), // ARGV[3]
      String(nowMs)         // ARGV[4]
    ) as [number, number, number];

    const [allowed, remainingTokens, retryAfterMs] = result;

    return {
      allowed: allowed === 1,
      remainingTokens,
      retryAfterMs,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('TokenBucket: Lua script execution failed', { key, error: message });

    // Fail-open or fail-secure based on config
    if (env.FAIL_MODE === 'open') {
      return { allowed: true, remainingTokens: -1, retryAfterMs: 0 };
    }

    return { allowed: false, remainingTokens: 0, retryAfterMs: 5000 };
  }
}

/**
 * Peek at the current bucket state without consuming a token.
 * Useful for admin dashboard / monitoring.
 */
export async function peekBucket(key: string): Promise<{ tokens: number; lastRefill: number } | null> {
  try {
    const data = await redis.hmget(`rl:${key}`, 'tokens', 'lastRefill');

    if (!data[0] || !data[1]) return null;

    return {
      tokens: Number(data[0]),
      lastRefill: Number(data[1]),
    };
  } catch {
    return null;
  }
}
