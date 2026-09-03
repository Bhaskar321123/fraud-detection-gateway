import { DetectionRule } from '../types/rule.interface';
import { GatewayRequest } from '../types/request-context';
import { RiskEvaluation, RiskAction, RuleResult } from '../types/risk-score';
import { env } from '../config/env';
import { logger } from '../config/logger';

// Import all rule singletons
import { rateLimitRule } from '../rules/rate-limit.rule';
import { geoShiftRule } from '../rules/geo-shift.rule';
import { payloadSizeRule } from '../rules/payload-size.rule';
import { ipReputationRule } from '../rules/ip-reputation.rule';
import { sqlInjectionRule } from '../rules/sql-injection.rule';
import { urlPhishingRule } from '../rules/url-phishing.rule';

/**
 * Central Risk Scoring Engine
 *
 * Orchestrates the evaluation of all registered detection rules against
 * an incoming request, aggregates individual scores, and determines
 * the enforcement action.
 *
 * Design principles:
 *  - Rules execute concurrently via Promise.allSettled (no single rule blocks others).
 *  - Per-rule scores are capped at each rule's maxScore.
 *  - Total score is capped at 100.
 *  - Evaluation is timed for performance monitoring.
 */
export class RiskEngine {
  private readonly rules: DetectionRule[];

  constructor(rules?: DetectionRule[]) {
    this.rules = rules ?? [
      rateLimitRule,
      geoShiftRule,
      payloadSizeRule,
      ipReputationRule,
      sqlInjectionRule,
      urlPhishingRule,
    ];
  }

  /**
   * Evaluate all enabled rules against the request.
   *
   * @param req - Enriched GatewayRequest with clientIp, geoLocation, etc.
   * @returns Complete risk evaluation with scores, action, and timing.
   */
  async evaluate(req: GatewayRequest): Promise<RiskEvaluation> {
    const startTime = performance.now();

    const enabledRules = this.rules.filter((rule) => rule.enabled);

    if (enabledRules.length === 0) {
      return {
        totalScore: 0,
        action: 'allowed',
        rules: [],
        evaluationTimeMs: this.elapsedMs(startTime),
      };
    }

    // Execute all rules concurrently
    const settledResults = await Promise.allSettled(
      enabledRules.map((rule) => this.evaluateRule(rule, req))
    );

    // Collect results, handling any unexpected rejections
    const ruleResults: RuleResult[] = settledResults.map((settled, index) => {
      if (settled.status === 'fulfilled') {
        return settled.value;
      }

      // Rule threw despite our try/catch wrapper — log and return safe score
      const ruleName = enabledRules[index]?.name ?? 'unknown';
      const reason = settled.reason instanceof Error ? settled.reason.message : String(settled.reason);
      logger.error('RiskEngine: uncaught rule rejection', { rule: ruleName, error: reason });

      return {
        rule: ruleName,
        reason: `Rule evaluation failed unexpectedly: ${reason}`,
        score: 0,
      };
    });

    // Aggregate
    const totalScore = Math.min(
      100,
      ruleResults.reduce((sum, r) => sum + r.score, 0)
    );

    const action = this.determineAction(totalScore);
    const evaluationTimeMs = this.elapsedMs(startTime);

    const evaluation: RiskEvaluation = {
      totalScore,
      action,
      rules: ruleResults,
      evaluationTimeMs,
    };

    // Performance warning
    if (evaluationTimeMs > 15) {
      logger.warn('RiskEngine: evaluation exceeded 15ms target', {
        evaluationTimeMs: evaluationTimeMs.toFixed(2),
        ip: req.clientIp,
      });
    }

    // Log high-risk evaluations
    if (totalScore >= env.RISK_THRESHOLD_WARN) {
      logger.info('RiskEngine: elevated risk detected', {
        ip: req.clientIp,
        totalScore,
        action,
        rules: ruleResults
          .filter((r) => r.score > 0)
          .map((r) => `${r.rule}:${r.score}`),
        evaluationTimeMs: evaluationTimeMs.toFixed(2),
      });
    }

    return evaluation;
  }

  /**
   * Evaluate a single rule with per-rule score capping and error isolation.
   */
  private async evaluateRule(rule: DetectionRule, req: GatewayRequest): Promise<RuleResult> {
    try {
      const result = await rule.evaluate(req);

      // Enforce per-rule maxScore cap
      return {
        ...result,
        score: Math.min(result.score, rule.maxScore),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`RiskEngine: rule "${rule.name}" threw`, { error: message });

      return {
        rule: rule.name,
        reason: `Rule evaluation error: ${message}`,
        score: 0,
      };
    }
  }

  /**
   * Map the total score to an enforcement action.
   */
  private determineAction(totalScore: number): RiskAction {
    if (totalScore >= env.RISK_THRESHOLD_BLOCK) return 'blocked';
    if (totalScore >= env.RISK_THRESHOLD_WARN) return 'warned';
    return 'allowed';
  }

  /**
   * Calculate elapsed milliseconds from a performance.now() start.
   */
  private elapsedMs(startTime: number): number {
    return Math.round((performance.now() - startTime) * 100) / 100;
  }

  /**
   * Get the list of registered rules (useful for admin introspection).
   */
  getRules(): ReadonlyArray<{ name: string; description: string; enabled: boolean; maxScore: number }> {
    return this.rules.map((rule) => ({
      name: rule.name,
      description: rule.description,
      enabled: rule.enabled,
      maxScore: rule.maxScore,
    }));
  }

  /**
   * Enable or disable a rule by name at runtime.
   */
  setRuleEnabled(ruleName: string, enabled: boolean): boolean {
    const rule = this.rules.find((r) => r.name === ruleName);
    if (!rule) return false;
    rule.enabled = enabled;
    logger.info(`RiskEngine: rule "${ruleName}" ${enabled ? 'enabled' : 'disabled'}`);
    return true;
  }
}

/** Singleton instance with all default rules */
export const riskEngine = new RiskEngine();
