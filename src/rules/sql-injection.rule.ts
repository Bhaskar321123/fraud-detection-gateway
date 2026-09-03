import { DetectionRule } from '../types/rule.interface';
import { GatewayRequest } from '../types/request-context';
import { RuleResult } from '../types/risk-score';
import { logger } from '../config/logger';

/**
 * Strict SQL Injection Detection Rule
 * Triggers an immediate high-risk score for definitive SQLi patterns.
 */
const SQLI_PATTERNS: ReadonlyArray<{ pattern: RegExp; label: string; weight: number }> = [
  { pattern: /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE|EXEC)\b.*\bFROM\b)/i, label: 'SQL Statement', weight: 80 },
  { pattern: /('|"|;)\s*--/,                           label: 'SQL comment injection', weight: 80 },
  { pattern: /(\bOR\b\s+\d+=\d+)/i,                    label: 'SQL tautology (OR 1=1)', weight: 80 },
  { pattern: /(\bAND\b\s+\d+=\d+)/i,                   label: 'SQL tautology (AND 1=1)', weight: 80 },
  { pattern: /UNION\s+(ALL\s+)?SELECT/i,               label: 'UNION SELECT injection', weight: 80 },
  { pattern: /;\s*(DROP|DELETE|TRUNCATE)\s/i,          label: 'Destructive SQL statement', weight: 100 },
];

export class SqlInjectionRule implements DetectionRule {
  readonly name = 'sql-injection';
  readonly description = 'Detects and blocks known SQL injection attack patterns';
  enabled = true;
  readonly maxScore = 100;

  async evaluate(req: GatewayRequest): Promise<RuleResult> {
    try {
      let score = 0;
      const detectedPatterns: string[] = [];

      const bodyText = this.extractBodyText(req);
      const urlText = req.originalUrl || req.url || '';

      const inspectText = (text: string, prefix: string) => {
        for (const { pattern, label, weight } of SQLI_PATTERNS) {
          if (pattern.test(text) && !detectedPatterns.includes(`${prefix}: ${label}`)) {
            score += weight;
            detectedPatterns.push(`${prefix}: ${label}`);
          }
        }
      };

      if (bodyText) inspectText(bodyText, 'Body');
      inspectText(urlText, 'URL');

      score = Math.min(score, this.maxScore);

      if (detectedPatterns.length > 0) {
        logger.warn('SqlInjectionRule: attack detected', {
          ip: req.clientIp,
          patterns: detectedPatterns,
          score,
        });
      }

      return {
        rule: this.name,
        reason: detectedPatterns.length > 0
          ? `SQL Injection detected: ${detectedPatterns.join(', ')}`
          : 'No SQL injection patterns detected',
        score,
        metadata: { detectedPatterns },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('SqlInjectionRule: evaluation failed', { error: message });
      return {
        rule: this.name,
        reason: 'Evaluation error',
        score: 0,
      };
    }
  }

  private extractBodyText(req: GatewayRequest): string | null {
    const body: unknown = req.body;
    if (!body) return null;
    if (typeof body === 'string') return body;
    if (Buffer.isBuffer(body)) return body.toString('utf-8');
    if (typeof body === 'object') {
      try {
        return JSON.stringify(body);
      } catch {
        return null;
      }
    }
    return null;
  }
}

export const sqlInjectionRule = new SqlInjectionRule();
