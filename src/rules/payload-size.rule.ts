import { DetectionRule } from '../types/rule.interface';
import { GatewayRequest } from '../types/request-context';
import { RuleResult } from '../types/risk-score';
import { env } from '../config/env';
import { logger } from '../config/logger';

/**
 * Dangerous patterns commonly found in injection / XSS attacks.
 * Each pattern has an associated weight to allow fine-grained scoring.
 */
const MALICIOUS_PATTERNS: ReadonlyArray<{ pattern: RegExp; label: string; weight: number }> = [
  // SQL Injection patterns
  { pattern: /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE|EXEC)\b\s)/i, label: 'SQL keyword', weight: 15 },
  { pattern: /('|"|;)\s*--/,                           label: 'SQL comment injection', weight: 20 },
  { pattern: /(\bOR\b\s+\d+=\d+)/i,                    label: 'SQL tautology (OR 1=1)', weight: 25 },
  { pattern: /(\bAND\b\s+\d+=\d+)/i,                   label: 'SQL tautology (AND 1=1)', weight: 20 },
  { pattern: /UNION\s+(ALL\s+)?SELECT/i,                label: 'UNION SELECT injection', weight: 25 },
  { pattern: /;\s*(DROP|DELETE|TRUNCATE)\s/i,           label: 'Destructive SQL statement', weight: 25 },

  // XSS patterns
  { pattern: /<script[\s>]/i,                           label: 'XSS script tag', weight: 25 },
  { pattern: /javascript\s*:/i,                         label: 'JavaScript protocol', weight: 20 },
  { pattern: /on(error|load|click|mouseover|focus)\s*=/i, label: 'XSS event handler', weight: 20 },
  { pattern: /<iframe[\s>]/i,                           label: 'iframe injection', weight: 15 },
  { pattern: /<img\s[^>]*onerror/i,                     label: 'img onerror XSS', weight: 20 },

  // Path traversal
  { pattern: /\.\.\//g,                                 label: 'Path traversal (../)', weight: 15 },
  { pattern: /\.\.\\/, label: 'Path traversal (..\\)',  weight: 15 },

  // Command injection
  { pattern: /[;&|`]\s*(cat|ls|dir|whoami|id|uname|curl|wget)\b/i, label: 'Command injection', weight: 25 },
  { pattern: /\$\(\s*(cat|ls|id|whoami)/i,              label: 'Shell command substitution', weight: 25 },
];

/**
 * Payload Size & Malformation Rule
 *
 * Two-stage evaluation:
 *  1. **Size check:** Flags request bodies exceeding MAX_PAYLOAD_SIZE_BYTES.
 *  2. **Content inspection:** Scans string payloads for SQLi, XSS, and path traversal patterns.
 *
 * Scoring:
 *  - Oversized payload: 10 points
 *  - Pattern matches: cumulative weight (capped at maxScore)
 */
export class PayloadSizeRule implements DetectionRule {
  readonly name = 'payload-size';
  readonly description = 'Flags unusually large or malformed request bodies (SQLi/XSS detection)';
  enabled = true;
  readonly maxScore = 30;

  async evaluate(req: GatewayRequest): Promise<RuleResult> {
    try {
      let score = 0;
      const detectedPatterns: string[] = [];

      // ── Stage 1: Size check ──────────────────────────────
      const contentLength = req.headers['content-length']
        ? parseInt(req.headers['content-length'], 10)
        : 0;

      if (contentLength > env.MAX_PAYLOAD_SIZE_BYTES) {
        score += 10;
        detectedPatterns.push(
          `Oversized payload: ${(contentLength / 1024).toFixed(1)}KB (max: ${(env.MAX_PAYLOAD_SIZE_BYTES / 1024).toFixed(0)}KB)`
        );
      }

      // ── Stage 2: Content inspection ──────────────────────
      const bodyText = this.extractBodyText(req);

      if (bodyText) {
        for (const { pattern, label, weight } of MALICIOUS_PATTERNS) {
          if (pattern.test(bodyText)) {
            score += weight;
            detectedPatterns.push(label);
          }
        }

        // Also inspect URL path + query string
        const urlText = req.originalUrl || req.url || '';
        for (const { pattern, label, weight } of MALICIOUS_PATTERNS) {
          if (pattern.test(urlText) && !detectedPatterns.includes(label)) {
            score += weight;
            detectedPatterns.push(`URL: ${label}`);
          }
        }
      } else {
        // Even without a body, inspect the URL itself
        const urlText = req.originalUrl || req.url || '';
        for (const { pattern, label, weight } of MALICIOUS_PATTERNS) {
          if (pattern.test(urlText)) {
            score += weight;
            detectedPatterns.push(`URL: ${label}`);
          }
        }
      }

      // Cap at maxScore
      score = Math.min(score, this.maxScore);

      if (detectedPatterns.length > 0) {
        logger.debug('PayloadSizeRule: suspicious patterns detected', {
          ip: req.clientIp,
          patterns: detectedPatterns,
          score,
        });
      }

      return {
        rule: this.name,
        reason: detectedPatterns.length > 0
          ? `Suspicious payload detected: ${detectedPatterns.join(', ')}`
          : 'Payload within normal parameters',
        score,
        metadata: {
          contentLength,
          detectedPatterns,
          maxAllowedBytes: env.MAX_PAYLOAD_SIZE_BYTES,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('PayloadSizeRule: evaluation failed', { error: message });

      return {
        rule: this.name,
        reason: 'Payload evaluation error — defaulting to safe score',
        score: 0,
      };
    }
  }

  /**
   * Extract a string representation of the request body for pattern matching.
   * Handles JSON objects, strings, buffers, and URL-encoded forms.
   */
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

/** Singleton instance */
export const payloadSizeRule = new PayloadSizeRule();
