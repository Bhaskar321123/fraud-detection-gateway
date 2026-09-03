import { Router } from 'express';
import { getMetrics, getMetricsTimeline } from '../controllers/metrics.controller';
import { getAuditLogs, getAuditLogById, purgeAuditLogs } from '../controllers/logs.controller';
import { riskEngine } from '../core/risk-engine';
import { getBlacklist, addToBlacklist, removeFromBlacklist } from '../rules/ip-reputation.rule';
import { isRedisHealthy } from '../config/redis';
import { isDatabaseHealthy } from '../config/database';
import { siteRegistry } from '../core/site-registry';
import { Request, Response } from 'express';
import { gatewayEvents } from '../core/events';
import { GatewayRequest } from '../types/request-context';

const router = Router();

// ──────────────────────────────────────────────────────────
// Metrics & Dashboard
// ──────────────────────────────────────────────────────────

/** GET /api/v1/admin/metrics — Aggregate dashboard metrics */
router.get('/metrics', getMetrics);

/** GET /api/v1/admin/metrics/timeline — Time-series chart data */
router.get('/metrics/timeline', getMetricsTimeline);

/** GET /api/v1/admin/stream — Live SSE threat feed */
router.get('/stream', (req: Request, res: Response) => {
  const filterSiteId = req.query['siteId'] as string | undefined;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  const sendEvent = (data: any) => {
    // If a siteId filter is requested, only send matching events
    if (filterSiteId && data.siteId !== filterSiteId) return;
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  gatewayEvents.on('request-evaluated', sendEvent);

  req.on('close', () => {
    gatewayEvents.off('request-evaluated', sendEvent);
  });
});

// ──────────────────────────────────────────────────────────
// Manual URL Analysis (Checkup)
// ──────────────────────────────────────────────────────────

/** POST /api/v1/admin/analyze — Manual URL checkup */
router.post('/analyze', async (req: Request, res: Response) => {
  const { url, method = 'GET', headers = {}, body = null } = req.body;

  if (!url || typeof url !== 'string') {
    res.status(400).json({ success: false, error: 'Request body must include { url: string }' });
    return;
  }

  // Create a mock GatewayRequest for the risk engine
  const mockReq = {
    url,
    originalUrl: url,
    method,
    headers,
    body,
    clientIp: '127.0.0.1',
    gatewayTimestamp: new Date().toISOString(),
    traceId: `manual-scan-${Date.now()}`,
    geoLocation: null,
  } as unknown as GatewayRequest;

  try {
    const evaluation = await riskEngine.evaluate(mockReq);
    res.json({ success: true, data: evaluation });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: message });
  }
});

// ──────────────────────────────────────────────────────────
// Target Sites Management
// ──────────────────────────────────────────────────────────

/** POST /api/v1/admin/sites — Register a new target site */
router.post('/sites', async (req: Request, res: Response) => {
  const { targetUrl } = req.body as { targetUrl?: string };

  if (!targetUrl || typeof targetUrl !== 'string') {
    res.status(400).json({
      success: false,
      error: 'Request body must include { targetUrl: string }',
    });
    return;
  }

  try {
    const site = await siteRegistry.registerSite(targetUrl);
    res.status(201).json({
      success: true,
      data: {
        ...site,
        proxyEndpoint: `/api/v1/proxy/${site.siteId}`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(400).json({ success: false, error: message });
  }
});

/** GET /api/v1/admin/sites — List all registered sites */
router.get('/sites', (_req: Request, res: Response) => {
  const sites = siteRegistry.listSites().map((site) => ({
    ...site,
    proxyEndpoint: `/api/v1/proxy/${site.siteId}`,
  }));
  res.json({ success: true, data: { sites, count: sites.length } });
});

/** DELETE /api/v1/admin/sites/:siteId — Deactivate a site */
router.delete('/sites/:siteId', async (req: Request, res: Response) => {
  const { siteId } = req.params;

  try {
    const removed = await siteRegistry.removeSite(siteId);
    if (!removed) {
      res.status(404).json({ success: false, error: `Site "${siteId}" not found` });
      return;
    }
    res.json({ success: true, data: { siteId, status: 'deactivated' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: message });
  }
});

// ──────────────────────────────────────────────────────────
// Audit Logs
// ──────────────────────────────────────────────────────────

/** GET /api/v1/admin/logs — Paginated audit logs */
router.get('/logs', getAuditLogs);

/** GET /api/v1/admin/logs/:id — Single audit log */
router.get('/logs/:id', getAuditLogById);

/** DELETE /api/v1/admin/logs — Purge old logs */
router.delete('/logs', purgeAuditLogs);

// ──────────────────────────────────────────────────────────
// Rules Management
// ──────────────────────────────────────────────────────────

/** GET /api/v1/admin/rules — List all registered detection rules */
router.get('/rules', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: riskEngine.getRules(),
  });
});

/** PATCH /api/v1/admin/rules/:name — Enable/disable a rule */
router.patch('/rules/:name', (req: Request, res: Response) => {
  const { name } = req.params;
  const { enabled } = req.body as { enabled?: boolean };

  if (typeof enabled !== 'boolean') {
    res.status(400).json({
      success: false,
      error: 'Request body must include { enabled: boolean }',
    });
    return;
  }

  const updated = riskEngine.setRuleEnabled(name, enabled);

  if (!updated) {
    res.status(404).json({
      success: false,
      error: `Rule "${name}" not found`,
    });
    return;
  }

  res.json({
    success: true,
    data: { rule: name, enabled },
  });
});

// ──────────────────────────────────────────────────────────
// IP Blacklist Management
// ──────────────────────────────────────────────────────────

/** GET /api/v1/admin/blacklist — Get all blacklisted IPs */
router.get('/blacklist', async (_req: Request, res: Response) => {
  try {
    const ips = await getBlacklist();
    res.json({ success: true, data: { ips, count: ips.length } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: message });
  }
});

/** POST /api/v1/admin/blacklist — Add IPs to blacklist */
router.post('/blacklist', async (req: Request, res: Response) => {
  const { ips } = req.body as { ips?: string[] };

  if (!Array.isArray(ips) || ips.length === 0) {
    res.status(400).json({
      success: false,
      error: 'Request body must include { ips: string[] }',
    });
    return;
  }

  try {
    const added = await addToBlacklist(ips);
    res.json({ success: true, data: { added, ips } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: message });
  }
});

/** DELETE /api/v1/admin/blacklist — Remove IPs from blacklist */
router.delete('/blacklist', async (req: Request, res: Response) => {
  const { ips } = req.body as { ips?: string[] };

  if (!Array.isArray(ips) || ips.length === 0) {
    res.status(400).json({
      success: false,
      error: 'Request body must include { ips: string[] }',
    });
    return;
  }

  try {
    const removed = await removeFromBlacklist(ips);
    res.json({ success: true, data: { removed, ips } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: message });
  }
});

// ──────────────────────────────────────────────────────────
// System Health
// ──────────────────────────────────────────────────────────

/** GET /api/v1/admin/health — System health check */
router.get('/health', async (_req: Request, res: Response) => {
  const [redisOk, dbOk] = await Promise.all([
    isRedisHealthy(),
    isDatabaseHealthy(),
  ]);

  const healthy = redisOk && dbOk;

  res.status(healthy ? 200 : 503).json({
    success: healthy,
    data: {
      status: healthy ? 'healthy' : 'degraded',
      services: {
        redis: redisOk ? 'connected' : 'disconnected',
        postgres: dbOk ? 'connected' : 'disconnected',
      },
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    },
  });
});

export default router;
