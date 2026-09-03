import { DetectionRule } from '../types/rule.interface';
import { GatewayRequest } from '../types/request-context';
import { RuleResult } from '../types/risk-score';
import { consumeToken } from '../core/token-bucket';
import { logger } from '../config/logger';

/**
 * Volumetric Rate Limiting Rule
 *
 * Evaluates request velocity per client IP using a Redis-backed token bucket.
 * Score is proportional to how depleted the bucket is:
 *   - Full bucket → score 0 (normal traffic)
 *   - Empty bucket → score 40 (maxScore, definite abuse)
 *
 * The token bucket parameters are driven by environment config.
 */
export class RateLimitRule implements DetectionRule {
  readonly name = 'rate-limit';
  readonly description = 'Volumetric request velocity check using token bucket algorithm';
  enabled = true;
  readonly maxScore = 100;

  async evaluate(req: GatewayRequest): Promise<RuleResult> {
    try {
      const bucketResult = await consumeToken(req.clientIp);

      if (!bucketResult.allowed) {
        logger.debug('RateLimitRule: token bucket exhausted', {
          ip: req.clientIp,
          remaining: bucketResult.remainingTokens,
          retryAfterMs: bucketResult.retryAfterMs,
        });

        return {
          rule: this.name,
          reason: `Rate limit exceeded — bucket exhausted, retry after ${bucketResult.retryAfterMs}ms`,
          score: this.maxScore,
          metadata: {
            remainingTokens: bucketResult.remainingTokens,
            retryAfterMs: bucketResult.retryAfterMs,
          },
        };
      }

      // If Redis failed and we are in fail-open mode, remainingTokens will be -1.
      // We should return a 0 score instead of mathematically punishing it.
      if (bucketResult.remainingTokens < 0) {
        return {
          rule: this.name,
          reason: 'Rate limit engine degraded (fail-open mode) — allowing traffic',
          score: 0,
          metadata: { remainingTokens: -1 }
        };
      }

      // Graduated scoring: fewer remaining tokens = higher risk
      // At 100 max tokens: 20 remaining → score ~32, 50 remaining → score ~20
      const { RATE_LIMIT_MAX_TOKENS } = await import('../config/env').then((m) => m.env);
      const depletionRatio = 1 - bucketResult.remainingTokens / RATE_LIMIT_MAX_TOKENS;

      // Only start scoring once bucket drops below 50%
      let score = 0;
      if (depletionRatio > 0.5) {
        score = Math.round(this.maxScore * ((depletionRatio - 0.5) / 0.5));
      }

      return {
        rule: this.name,
        reason: score > 0
          ? `Elevated request rate — ${bucketResult.remainingTokens} tokens remaining`
          : 'Request rate within normal limits',
        score,
        metadata: {
          remainingTokens: bucketResult.remainingTokens,
          depletionRatio: Math.round(depletionRatio * 100) / 100,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('RateLimitRule: evaluation failed', { error: message });

      return {
        rule: this.name,
        reason: 'Rate limit evaluation error — defaulting to safe score',
        score: 0,
      };
    }
  }
}

/** Singleton instance */
export const rateLimitRule = new RateLimitRule();
