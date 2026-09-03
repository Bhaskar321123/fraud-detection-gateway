import Redis from 'ioredis';
import { env } from './env';
import { logger } from './logger';

/**
 * Redis connection factory with automatic reconnection, health logging,
 * and pre-loaded Lua scripts for atomic token-bucket operations.
 */
function createRedisClient(): Redis {
  const client = new Redis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD || undefined,
    db: env.REDIS_DB,
    keyPrefix: env.REDIS_KEY_PREFIX,
    maxRetriesPerRequest: 3,
    retryStrategy(times: number): number | null {
      if (times > 10) {
        logger.error('Redis: max reconnection attempts exceeded — giving up');
        return null; // stop retrying
      }
      const delay = Math.min(times * 200, 5000);
      logger.warn(`Redis: reconnecting in ${delay}ms (attempt ${times})`);
      return delay;
    },
    enableReadyCheck: true,
    lazyConnect: false,
  });

  client.on('connect', () => logger.info('Redis: TCP connection established'));
  client.on('ready', () => logger.info('Redis: ready to accept commands'));
  client.on('error', (err) => logger.error('Redis: connection error', { error: err.message }));
  client.on('close', () => logger.warn('Redis: connection closed'));
  client.on('reconnecting', () => logger.info('Redis: attempting reconnection…'));

  return client;
}

/** Singleton Redis client */
export const redis = createRedisClient();

// ──────────────────────────────────────────────────────────────
// Lua Scripts — loaded once, executed atomically on Redis
// ──────────────────────────────────────────────────────────────

/**
 * Atomic Token Bucket rate-limiter implemented as a Lua script.
 *
 * KEYS[1]  = bucket key  (e.g., "fdg:rl:<ip>")
 * ARGV[1]  = maxTokens    — bucket capacity
 * ARGV[2]  = refillRate   — tokens added per interval
 * ARGV[3]  = refillIntervalMs — interval duration in ms
 * ARGV[4]  = nowMs        — current timestamp in ms
 *
 * Returns: [allowed (0|1), remainingTokens, retryAfterMs]
 */
export const TOKEN_BUCKET_LUA = `
local key            = KEYS[1]
local maxTokens      = tonumber(ARGV[1])
local refillRate     = tonumber(ARGV[2])
local refillInterval = tonumber(ARGV[3])
local now            = tonumber(ARGV[4])

-- Fetch current state
local data = redis.call('HMGET', key, 'tokens', 'lastRefill')
local tokens    = tonumber(data[1])
local lastRefill = tonumber(data[2])

-- Initialise bucket on first access
if tokens == nil then
  tokens     = maxTokens
  lastRefill = now
end

-- Calculate token refill
local elapsed    = now - lastRefill
local intervals  = math.floor(elapsed / refillInterval)
if intervals > 0 then
  tokens     = math.min(maxTokens, tokens + intervals * refillRate)
  lastRefill = lastRefill + intervals * refillInterval
end

-- Attempt to consume one token
local allowed      = 0
local retryAfterMs = 0

if tokens >= 1 then
  tokens  = tokens - 1
  allowed = 1
else
  -- Calculate when the next token will be available
  retryAfterMs = refillInterval - (now - lastRefill)
  if retryAfterMs < 0 then retryAfterMs = 0 end
end

-- Persist state with TTL (2x window to auto-cleanup stale buckets)
redis.call('HMSET', key, 'tokens', tokens, 'lastRefill', lastRefill)
redis.call('PEXPIRE', key, refillInterval * maxTokens * 2)

return { allowed, tokens, retryAfterMs }
`;

/**
 * Geo-shift tracking Lua script.
 *
 * KEYS[1]  = geo key  (e.g., "fdg:geo:<identifier>")
 * ARGV[1]  = latitude
 * ARGV[2]  = longitude
 * ARGV[3]  = nowMs
 * ARGV[4]  = windowMs  — how long to keep geo entries
 *
 * Returns: [previousLat, previousLon, previousTimestamp] or empty if first observation.
 */
export const GEO_SHIFT_LUA = `
local key      = KEYS[1]
local lat      = ARGV[1]
local lon      = ARGV[2]
local now      = tonumber(ARGV[3])
local windowMs = tonumber(ARGV[4])

-- Fetch previous location
local prev = redis.call('HMGET', key, 'lat', 'lon', 'ts')
local prevLat = prev[1]
local prevLon = prev[2]
local prevTs  = prev[3]

-- Store current location
redis.call('HMSET', key, 'lat', lat, 'lon', lon, 'ts', now)
redis.call('PEXPIRE', key, windowMs)

if prevLat == false then
  return {}
end

return { prevLat, prevLon, prevTs }
`;

/**
 * Helper to check if the Redis client is connected and responsive.
 */
export async function isRedisHealthy(): Promise<boolean> {
  try {
    const pong = await redis.ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
}
