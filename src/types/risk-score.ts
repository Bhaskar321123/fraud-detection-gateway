/**
 * Result produced by a single detection rule.
 */
export interface RuleResult {
  /** Machine-readable rule identifier (e.g., "rate-limit", "geo-shift") */
  rule: string;

  /** Human-readable explanation of why this score was assigned */
  reason: string;

  /** Score contribution from this rule (0–100 scale) */
  score: number;

  /** Optional structured metadata produced by the rule */
  metadata?: Record<string, unknown>;
}

/**
 * Aggregate risk evaluation produced by the risk engine.
 */
export interface RiskEvaluation {
  /** Sum of all rule scores, capped at 100 */
  totalScore: number;

  /** Enforcement action taken based on the score */
  action: RiskAction;

  /** Breakdown of individual rule evaluations */
  rules: RuleResult[];

  /** Wall-clock time spent evaluating all rules (ms) */
  evaluationTimeMs: number;
}

/**
 * Possible enforcement actions based on risk score thresholds.
 */
export type RiskAction = 'allowed' | 'warned' | 'blocked';

/**
 * Geographic location associated with a request.
 */
export interface GeoLocation {
  country: string;  // ISO 3166-1 alpha-2
  region: string;
  city: string;
  latitude: number;
  longitude: number;
  timezone: string;
}

/**
 * Audit log entry persisted to PostgreSQL.
 */
export interface AuditLogEntry {
  id?: string;
  created_at?: string;
  client_ip: string;
  method: string;
  path: string;
  risk_score: number;
  action: RiskAction;
  rule_results: RuleResult[];
  request_meta: RequestMeta | null;
  user_id: string | null;
  country: string | null;
  city: string | null;
  site_id: string | null;
}

/**
 * Metadata captured from the incoming request for audit purposes.
 */
export interface RequestMeta {
  userAgent: string;
  contentType: string | null;
  contentLength: number | null;
  referer: string | null;
  origin: string | null;
  geo: GeoLocation | null;
}

/**
 * Dashboard metrics summary returned by the admin API.
 */
export interface MetricsSummary {
  /** Total requests evaluated within the time window */
  totalRequests: number;

  /** Count of requests per action type */
  byAction: Record<RiskAction, number>;

  /** Average risk score in the window */
  averageRiskScore: number;

  /** Top offending client IPs */
  topBlockedIps: Array<{ ip: string; count: number }>;

  /** Time window boundaries (ISO-8601) */
  windowStart: string;
  windowEnd: string;
}
