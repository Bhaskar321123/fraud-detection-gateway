import { DetectionRule } from '../types/rule.interface';
import { GatewayRequest } from '../types/request-context';
import { RuleResult } from '../types/risk-score';
import { redis } from '../config/redis';
import { env } from '../config/env';
import { logger } from '../config/logger';

/**
 * Well-known suspicious IP ranges (CIDR-style matching is complex for in-memory,
 * so we use Redis sets for exact-match blacklists and prefix-based checks for ranges).
 *
 * This module checks:
 *  1. Exact IP match against a Redis blacklist set (`fdg:blacklist:ips`)
 *  2. Subnet prefix match against known proxy/VPN/datacenter ranges
 *  3. Tor exit node list (populated by seed script)
 */

/** Common datacenter/hosting IP prefixes often associated with bot traffic */
const DATACENTER_PREFIXES: ReadonlyArray<string> = [
  // These are example prefixes — in production, populate from threat intel feeds
  '198.51.100.',   // TEST-NET-2 (RFC 5737) — used here as placeholder
  '203.0.113.',    // TEST-NET-3 (RFC 5737) — used here as placeholder
];

/**
 * IP Reputation Rule
 *
 * Checks the client IP against:
 *  1. **Redis blacklist** (`blacklist:ips` set) — dynamically managed
 *  2. **Datacenter prefix list** — known hosting/VPN ranges
 *  3. **Redis suspicious set** (`suspicious:ips` set) — lower confidence
 *
 * Scoring:
 *  - Blacklisted IP: 30 (maxScore — immediate high risk)
 *  - Datacenter/VPN range: 15
 *  - Suspicious IP: 10
 *  - Clean IP: 0
 */
export class IpReputationRule implements DetectionRule {
  readonly name = 'ip-reputation';
  readonly description = 'Checks client IP against blacklisted and suspicious IP databases';
  enabled = true;
  readonly maxScore = 30;

  async evaluate(req: GatewayRequest): Promise<RuleResult> {
    try {
      const ip = req.clientIp;

      if (!ip || ip === 'unknown') {
        return {
          rule: this.name,
          reason: 'Client IP unknown — cannot evaluate reputation',
          score: 5, // Slightly suspicious: unable to identify origin
        };
      }

      // ── Check 1: Redis exact blacklist ────────────────────
      const isBlacklisted = await this.checkRedisSet('blacklist:ips', ip);

      if (isBlacklisted) {
        logger.debug('IpReputationRule: blacklisted IP detected', { ip });

        return {
          rule: this.name,
          reason: `IP ${ip} is blacklisted`,
          score: this.maxScore,
          metadata: { ip, source: 'blacklist', confidence: 'high' },
        };
      }

      // ── Check 2: Datacenter / VPN prefix match ───────────
      const matchedPrefix = DATACENTER_PREFIXES.find((prefix) => ip.startsWith(prefix));

      if (matchedPrefix) {
        logger.debug('IpReputationRule: datacenter IP range detected', { ip, prefix: matchedPrefix });

        return {
          rule: this.name,
          reason: `IP ${ip} matches known datacenter/VPN range (${matchedPrefix}*)`,
          score: 15,
          metadata: { ip, source: 'datacenter-prefix', matchedPrefix, confidence: 'medium' },
        };
      }

      // ── Check 3: Redis suspicious set (lower confidence) ──
      const isSuspicious = await this.checkRedisSet('suspicious:ips', ip);

      if (isSuspicious) {
        logger.debug('IpReputationRule: suspicious IP detected', { ip });

        return {
          rule: this.name,
          reason: `IP ${ip} is on the suspicious watchlist`,
          score: 10,
          metadata: { ip, source: 'suspicious-list', confidence: 'low' },
        };
      }

      // ── Clean IP ──────────────────────────────────────────
      return {
        rule: this.name,
        reason: 'IP reputation clean',
        score: 0,
        metadata: { ip, source: 'clean' },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('IpReputationRule: evaluation failed', { error: message });

      // Fail-mode dependent behavior
      if (env.FAIL_MODE === 'secure') {
        return {
          rule: this.name,
          reason: 'IP reputation check failed — blocking under secure fail mode',
          score: 10,
        };
      }

      return {
        rule: this.name,
        reason: 'IP reputation check failed — allowing under open fail mode',
        score: 0,
      };
    }
  }

  /**
   * Check if an IP exists in a Redis set.
   * Returns false on Redis errors (fail-open by default).
   */
  private async checkRedisSet(setKey: string, ip: string): Promise<boolean> {
    try {
      const result = await redis.sismember(setKey, ip);
      return result === 1;
    } catch {
      return false;
    }
  }
}

/** Singleton instance */
export const ipReputationRule = new IpReputationRule();

// ──────────────────────────────────────────────────────────────
// Admin helpers for managing the blacklist at runtime
// ──────────────────────────────────────────────────────────────

/**
 * Add one or more IPs to the blacklist.
 */
export async function addToBlacklist(ips: string[]): Promise<number> {
  if (ips.length === 0) return 0;
  return redis.sadd('blacklist:ips', ...ips);
}

/**
 * Remove one or more IPs from the blacklist.
 */
export async function removeFromBlacklist(ips: string[]): Promise<number> {
  if (ips.length === 0) return 0;
  return redis.srem('blacklist:ips', ...ips);
}

/**
 * Get all currently blacklisted IPs.
 */
export async function getBlacklist(): Promise<string[]> {
  return redis.smembers('blacklist:ips');
}
