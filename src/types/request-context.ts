import { Request } from 'express';
import { RiskEvaluation } from './risk-score';
import { GeoLocation } from './risk-score';

/**
 * Extended Express Request carrying gateway context through the middleware chain.
 */
export interface GatewayRequest extends Request {
  /** Resolved client IP after proxy header parsing */
  clientIp: string;

  /** ISO-8601 timestamp when the request entered the gateway */
  gatewayTimestamp: string;

  /** Unique request trace ID for correlation */
  traceId: string;

  /** Resolved geo-location of the client (may be null for localhost / unknown IPs) */
  geoLocation: GeoLocation | null;

  /** Populated after risk evaluation completes */
  riskEvaluation?: RiskEvaluation;

  /** Target site ID when routing through a registered site proxy */
  siteId?: string;

  /** Fully resolved target URL for this request */
  targetUrl?: string;
}
