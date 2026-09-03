import { GatewayRequest } from './request-context';
import { RuleResult } from './risk-score';

/**
 * Contract that every detection rule module must implement.
 *
 * Each rule is a stateless evaluator: it receives the enriched request context
 * and returns a RuleResult with a score contribution and explanation.
 *
 * Rules MUST:
 *  - Complete evaluation within 10ms under normal conditions.
 *  - Return a score of 0 when the request is benign.
 *  - Gracefully handle infrastructure failures (Redis down, lookup errors)
 *    by returning a score of 0 (fail-open) or a configurable fallback.
 *  - Never throw — always catch and return a safe RuleResult.
 */
export interface DetectionRule {
  /**
   * Unique machine-readable identifier for this rule.
   * Must match the `rule` field in the returned RuleResult.
   * Convention: kebab-case (e.g., "rate-limit", "geo-shift").
   */
  readonly name: string;

  /**
   * Short human-readable description shown in admin dashboards.
   */
  readonly description: string;

  /**
   * Whether this rule is currently active.
   * Disabled rules are skipped by the risk engine.
   */
  enabled: boolean;

  /**
   * Maximum score this rule can contribute to the total risk score.
   * Used by the risk engine to enforce per-rule caps.
   */
  readonly maxScore: number;

  /**
   * Evaluate the request and return a risk contribution.
   *
   * @param req - Enriched gateway request with clientIp, geoLocation, etc.
   * @returns A promise resolving to the rule's score and explanation.
   */
  evaluate(req: GatewayRequest): Promise<RuleResult>;
}
