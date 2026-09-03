import { DetectionRule } from '../types/rule.interface';
import { GatewayRequest } from '../types/request-context';
import { RuleResult } from '../types/risk-score';

/**
 * Fast Levenshtein distance algorithm to detect typosquatting/impersonation.
 */
function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          Math.min(
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          )
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

/**
 * Call the Python ML microservice for XGBoost inference.
 * Returns phishing probability [0.0 - 1.0] or null if service is unavailable.
 */
async function getMLPrediction(url: string): Promise<{ probability: number; verdict: string } | null> {
  const mlServiceUrl = process.env.ML_SERVICE_URL || 'http://localhost:5050';

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000); // 3s timeout

    const response = await fetch(`${mlServiceUrl}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) return null;

    const data = await response.json() as { probability: number; verdict: string };
    return { probability: data.probability, verdict: data.verdict };
  } catch (e) {
    // ML service is down — graceful degradation to Engine A only
    return null;
  }
}

const PROTECTED_BRANDS = [
  'paypal', 'google', 'microsoft', 'apple', 'amazon',
  'facebook', 'netflix', 'icloud', 'instagram', 'twitter',
  'linkedin', 'dropbox', 'chase', 'wellsfargo', 'bankofamerica',
];

/**
 * URL Phishing Heuristics + ML Classifier Rule
 *
 * Engine A: Synchronous structural heuristics (<1ms)
 * Engine B: XGBoost ML classifier via Python microservice (~5-50ms)
 *
 * Hybrid scoring formula:
 *   Final Score = min(100, (P_phishing × 70) + Σ(Rule Trigger Penalties))
 */
export class UrlPhishingRule implements DetectionRule {
  readonly name = 'url-phishing';
  readonly description = 'Detects phishing URLs via structural heuristics and ML classification';
  enabled = true;
  readonly maxScore = 100;

  async evaluate(req: GatewayRequest): Promise<RuleResult> {
    const patterns: string[] = [];
    let heuristicScore = 0;

    const targetUrl = req.targetUrl || req.url || '';
    if (!targetUrl) return { rule: this.name, score: 0, reason: 'No URL provided' };

    try {
      // ════════════════════════════════════════════════════════
      // ENGINE A: Hard Heuristics (synchronous, <1ms)
      // ════════════════════════════════════════════════════════

      // ── 1. Structural Checks ──────────────────────────────

      if (targetUrl.length > 75) {
        heuristicScore += 10;
        patterns.push(`URL length exceeds 75 chars (${targetUrl.length})`);
      }

      const symbols = targetUrl.match(/[@=?%\-]/g) || [];
      if (symbols.length > 8) {
        heuristicScore += 10;
        patterns.push(`High symbol count detected (${symbols.length})`);
      }

      const doubleSlashes = (targetUrl.match(/\/\//g) || []).length;
      if (doubleSlashes > 1) {
        heuristicScore += 15;
        patterns.push(`Multiple double-slashes detected (${doubleSlashes})`);
      }

      // ── 2. Domain & Brand Impersonation Checks ────────────

      let hostname = '';
      try {
        const parsedUrl = new URL(targetUrl);
        hostname = parsedUrl.hostname;
      } catch (e) {
        // URL has no protocol — try prepending http://
        try {
          const parsedUrl = new URL('http://' + targetUrl);
          hostname = parsedUrl.hostname;
        } catch (e2) {
          hostname = req.headers['host'] || '';
        }
      }

      if (hostname) {
        const parts = hostname.split('.');
        if (parts.length > 3) {
          heuristicScore += 15;
          patterns.push(`Deep subdomain nesting detected (${parts.length - 2} subdomains)`);
        }

        if (/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(hostname)) {
          heuristicScore += 20;
          patterns.push(`IP address used as hostname (${hostname})`);
        }

        const hostParts = hostname.replace(/\.[a-z]{2,4}$/i, '').split(/[\.\-]/);

        for (const part of hostParts) {
          const lowerPart = part.toLowerCase();
          if (lowerPart.length < 4) continue;

          for (const brand of PROTECTED_BRANDS) {
            if (lowerPart === brand) {
              if (parts.length > 2 && !hostname.endsWith(`${brand}.com`) && !hostname.endsWith(`${brand}.net`)) {
                heuristicScore += 20;
                patterns.push(`Brand name '${brand}' used suspiciously in subdomain`);
              }
            } else {
              const dist = levenshtein(lowerPart, brand);
              if (dist === 1) {
                heuristicScore += 30;
                patterns.push(`Brand impersonation: '${lowerPart}' mimics '${brand}'`);
              }
            }
          }
        }
      }

      // Cap Engine A contribution at 30 for hybrid formula
      const engineAPenalty = Math.min(heuristicScore, 30);

      // ════════════════════════════════════════════════════════
      // ENGINE B: XGBoost ML Classifier (async, ~5-50ms)
      // ════════════════════════════════════════════════════════

      const mlResult = await getMLPrediction(targetUrl);

      let mlProbability = 0;
      if (mlResult) {
        mlProbability = mlResult.probability;
        if (mlProbability > 0.1) {
          patterns.push(`ML classifier: P(phishing) = ${(mlProbability * 100).toFixed(1)}% [${mlResult.verdict}]`);
        }
      } else {
        patterns.push('ML service unavailable — using heuristics only');
      }

      // ════════════════════════════════════════════════════════
      // HYBRID SCORING FORMULA
      // Final Score = min(100, (P_phishing × 70) + Σ(Rule Penalties))
      // ════════════════════════════════════════════════════════

      let finalScore: number;

      if (mlResult) {
        finalScore = Math.min(100, Math.round((mlProbability * 100) + engineAPenalty));
      } else {
        // Fallback: pure heuristic scoring (uncapped)
        finalScore = Math.min(this.maxScore, heuristicScore);
      }

      if (finalScore > 0) {
        return {
          rule: this.name,
          score: finalScore,
          reason: mlResult
            ? 'Hybrid analysis: ML classifier + structural heuristics flagged this URL'
            : 'Heuristic analysis flagged structural anomalies (ML service unavailable)',
          metadata: {
            detectedPatterns: patterns,
            mlProbability: mlResult ? mlProbability : null,
            engineAPenalty,
          },
        };
      }

      return { rule: this.name, score: 0, reason: 'URL appears safe (heuristics clean, ML confidence low)' };

    } catch (e) {
      return { rule: this.name, score: 0, reason: 'Failed to execute phishing analysis' };
    }
  }
}

// Singleton instance
export const urlPhishingRule = new UrlPhishingRule();
