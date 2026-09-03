import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { GatewayRequest } from '../types/request-context';
import { AuditLogEntry, RequestMeta, RiskAction } from '../types/risk-score';
import { riskEngine } from './risk-engine';
import { extractClientIp } from '../utils/ip-lookup';
import { resolveGeoLocation } from '../utils/geoip';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { db, isDatabaseHealthy } from '../config/database';
import { isRedisHealthy } from '../config/redis';
import { gatewayEvents } from './events';
import { siteRegistry } from './site-registry';

/**
 * Primary Gateway Middleware
 *
 * Intercepts every incoming HTTP request and orchestrates:
 *  1. Request enrichment (client IP, trace ID, geo-location)
 *  2. Infrastructure health pre-check (Redis, PostgreSQL)
 *  3. Risk evaluation via the scoring engine
 *  4. Enforcement (block / warn / allow)
 *  5. Audit log persistence (async, non-blocking)
 *  6. Response header injection (risk score, trace ID)
 */
export async function gatewayMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const gatewayReq = req as GatewayRequest;

  try {
    // ── Step 1: Enrich request context ────────────────────
    gatewayReq.traceId = uuidv4();
    gatewayReq.gatewayTimestamp = new Date().toISOString();
    gatewayReq.clientIp = extractClientIp(req);
    gatewayReq.geoLocation = resolveGeoLocation(gatewayReq.clientIp);

    // Inject trace ID into response headers immediately
    res.setHeader('X-Trace-Id', gatewayReq.traceId);
    res.setHeader('X-Gateway-Version', '1.0.0');

    // ── Step 1.5: Extract target URL for risk evaluation ────────
    if (req.path.startsWith('/api/v1/proxy/')) {
      const parts = req.path.split('/');
      if (parts.length >= 5) {
        const siteId = parts[4];
        gatewayReq.siteId = siteId;
        
        const site = siteRegistry.getSite(siteId);
        if (site && site.active) {
          const stripped = req.path.replace(`/api/v1/proxy/${siteId}`, '') || '/';
          gatewayReq.targetUrl = site.targetUrl.replace(/\/$/, '') + stripped;
        }
      }
    }

    // ── Step 2: Infrastructure health check ──────────────
    const redisHealthy = await isRedisHealthy();

    if (!redisHealthy) {
      logger.warn('Gateway: Redis is unhealthy', { traceId: gatewayReq.traceId });

      if (env.FAIL_MODE === 'secure') {
        res.status(503).json({
          error: 'Service temporarily unavailable',
          traceId: gatewayReq.traceId,
        });
        return;
      }

      // fail-open: skip risk evaluation, forward request
      logger.warn('Gateway: fail-open mode — bypassing risk evaluation');
      next();
      return;
    }

    // ── Step 3: Risk evaluation ──────────────────────────
    const evaluation = await riskEngine.evaluate(gatewayReq);
    gatewayReq.riskEvaluation = evaluation;

    // ── Step 4: Inject risk headers ──────────────────────
    res.setHeader('X-Risk-Score', String(evaluation.totalScore));
    res.setHeader('X-Risk-Action', evaluation.action);
    res.setHeader('X-Evaluation-Time-Ms', String(evaluation.evaluationTimeMs));

    // ── Step 4.5: Emit Live Event ────────────────────────
    gatewayEvents.emit('request-evaluated', {
      traceId: gatewayReq.traceId,
      timestamp: gatewayReq.gatewayTimestamp,
      ip: gatewayReq.clientIp,
      path: req.originalUrl || req.path,
      score: evaluation.totalScore,
      action: evaluation.action,
      rules: evaluation.rules.filter((r) => r.score > 0).map((r) => r.rule),
      siteId: gatewayReq.siteId || null,
    });

    // ── Step 5: Audit log (fire-and-forget) ──────────────
    persistAuditLog(gatewayReq, evaluation.action).catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('Gateway: audit log persistence failed', { error: message });
    });

    // ── Step 6: Enforcement ──────────────────────────────
    if (evaluation.action === 'blocked') {
      logger.info('Gateway: request BLOCKED', {
        traceId: gatewayReq.traceId,
        ip: gatewayReq.clientIp,
        path: req.path,
        totalScore: evaluation.totalScore,
        rules: evaluation.rules.filter((r) => r.score > 0).map((r) => `${r.rule}:${r.score}`),
      });

      // Use 429 for rate-limit blocks, 403 for other fraud blocks
      const isRateLimitBlock = evaluation.rules.some(
        (r) => r.rule === 'rate-limit' && r.score >= 30
      );

      const statusCode = isRateLimitBlock ? 429 : 403;

      // Add Retry-After header for rate-limit blocks
      if (isRateLimitBlock) {
        const retryAfterMs = evaluation.rules
          .find((r) => r.rule === 'rate-limit')
          ?.metadata?.['retryAfterMs'] as number | undefined;

        if (retryAfterMs) {
          res.setHeader('Retry-After', String(Math.ceil(retryAfterMs / 1000)));
        }
      }

      res.status(statusCode).json({
        error: statusCode === 429 ? 'Too Many Requests' : 'Forbidden',
        message: 'Request blocked by fraud detection gateway',
        traceId: gatewayReq.traceId,
        riskScore: evaluation.totalScore,
        evaluationTimeMs: evaluation.evaluationTimeMs,
      });
      return;
    }

    if (evaluation.action === 'warned') {
      logger.info('Gateway: request WARNED (allowed with caution)', {
        traceId: gatewayReq.traceId,
        ip: gatewayReq.clientIp,
        path: req.path,
        totalScore: evaluation.totalScore,
      });
    }

    // ── Allow: forward to upstream ───────────────────────
    next();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Gateway: unhandled middleware error', {
      traceId: gatewayReq.traceId,
      error: message,
    });

    if (env.FAIL_MODE === 'open') {
      next();
    } else {
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Gateway evaluation failed',
        traceId: gatewayReq.traceId,
      });
    }
  }
}

/**
 * Persist an audit log entry to PostgreSQL (non-blocking).
 * Swallows errors silently — audit logging should never block the request.
 */
async function persistAuditLog(
  req: GatewayRequest,
  action: RiskAction
): Promise<void> {
  const healthy = await isDatabaseHealthy();
  if (!healthy) {
    logger.warn('Gateway: PostgreSQL unhealthy — skipping audit log');
    return;
  }

  const meta: RequestMeta = {
    userAgent: req.headers['user-agent'] ?? '',
    contentType: (req.headers['content-type'] as string) ?? null,
    contentLength: req.headers['content-length'] ? parseInt(req.headers['content-length'], 10) : null,
    referer: (req.headers['referer'] as string) ?? null,
    origin: (req.headers['origin'] as string) ?? null,
    geo: req.geoLocation,
  };

  const entry: AuditLogEntry = {
    client_ip: req.clientIp,
    method: req.method,
    path: req.originalUrl || req.path,
    risk_score: req.riskEvaluation?.totalScore ?? 0,
    action,
    rule_results: req.riskEvaluation?.rules ?? [],
    request_meta: meta,
    user_id: null,
    country: req.geoLocation?.country ?? null,
    city: req.geoLocation?.city ?? null,
    site_id: req.siteId ?? null,
  };

  await db('audit_logs').insert({
    ...entry,
    rule_results: JSON.stringify(entry.rule_results) as any,
    request_meta: JSON.stringify(entry.request_meta) as any,
  });
}
