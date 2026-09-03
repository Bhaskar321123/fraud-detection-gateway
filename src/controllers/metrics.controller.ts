import { Request, Response } from 'express';
import { db } from '../config/database';
import { logger } from '../config/logger';
import { MetricsSummary, RiskAction } from '../types/risk-score';

/**
 * GET /api/v1/admin/metrics
 *
 * Returns aggregated metrics for the admin dashboard:
 *  - Total requests in the time window
 *  - Breakdown by action (allowed / warned / blocked)
 *  - Average risk score
 *  - Top blocked IPs
 *
 * Query params:
 *  - window: time window in minutes (default: 60)
 *  - limit:  max top-blocked IPs to return (default: 10)
 */
export async function getMetrics(req: Request, res: Response): Promise<void> {
  try {
    const windowMinutes = parseInt(req.query['window'] as string, 10) || 60;
    const limit = parseInt(req.query['limit'] as string, 10) || 10;
    const siteId = req.query['siteId'] as string | undefined;

    const windowStart = new Date(Date.now() - windowMinutes * 60_000).toISOString();
    const windowEnd = new Date().toISOString();

    // Build base query with optional site filter
    const baseFilter = (qb: any) => {
      qb.where('created_at', '>=', windowStart);
      if (siteId) qb.where('site_id', siteId);
    };

    // Total requests and average score
    const [totals] = await db('audit_logs')
      .where(baseFilter)
      .select(
        db.raw('COUNT(*)::int as total'),
        db.raw('COALESCE(AVG(risk_score), 0)::float as avg_score')
      );

    // Breakdown by action
    const actionBreakdown = await db('audit_logs')
      .where(baseFilter)
      .groupBy('action')
      .select('action', db.raw('COUNT(*)::int as count'));

    const byAction: Record<RiskAction, number> = {
      allowed: 0,
      warned: 0,
      blocked: 0,
    };

    for (const row of actionBreakdown) {
      const action = row.action as RiskAction;
      if (action in byAction) {
        byAction[action] = row.count;
      }
    }

    // Top blocked IPs
    const topBlockedIps = await db('audit_logs')
      .where(baseFilter)
      .where('action', 'blocked')
      .groupBy('client_ip')
      .orderBy('count', 'desc')
      .limit(limit)
      .select('client_ip as ip', db.raw('COUNT(*)::int as count'));

    const metrics: MetricsSummary = {
      totalRequests: totals?.total ?? 0,
      byAction,
      averageRiskScore: Math.round((totals?.avg_score ?? 0) * 100) / 100,
      topBlockedIps: topBlockedIps.map((row: { ip: string; count: number }) => ({
        ip: row.ip,
        count: row.count,
      })),
      windowStart,
      windowEnd,
    };

    res.json({
      success: true,
      data: metrics,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('MetricsController: failed to fetch metrics', { error: message });

    res.status(500).json({
      success: false,
      error: 'Failed to retrieve metrics',
    });
  }
}

/**
 * GET /api/v1/admin/metrics/timeline
 *
 * Returns time-series data for charting (requests per interval).
 *
 * Query params:
 *  - window:   time window in minutes (default: 60)
 *  - interval: bucket size in minutes (default: 5)
 */
export async function getMetricsTimeline(req: Request, res: Response): Promise<void> {
  try {
    const windowMinutes = parseInt(req.query['window'] as string, 10) || 60;
    const intervalMinutes = parseInt(req.query['interval'] as string, 10) || 5;
    const siteId = req.query['siteId'] as string | undefined;

    const windowStart = new Date(Date.now() - windowMinutes * 60_000).toISOString();

    let timelineQuery = db('audit_logs')
      .where('created_at', '>=', windowStart);

    if (siteId) {
      timelineQuery = timelineQuery.where('site_id', siteId);
    }

    const timeline = await timelineQuery
      .select(
        db.raw(`date_trunc('minute', created_at - (EXTRACT(MINUTE FROM created_at)::int % ${intervalMinutes}) * interval '1 minute') as bucket`),
        'action',
        db.raw('COUNT(*)::int as count')
      )
      .groupBy('bucket', 'action')
      .orderBy('bucket', 'asc');

    res.json({
      success: true,
      data: {
        windowMinutes,
        intervalMinutes,
        buckets: timeline,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('MetricsController: timeline query failed', { error: message });

    res.status(500).json({
      success: false,
      error: 'Failed to retrieve timeline data',
    });
  }
}
