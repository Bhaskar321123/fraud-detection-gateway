import { Router, Request, Response } from 'express';
import { createProxyMiddleware, Options, fixRequestBody } from 'http-proxy-middleware';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { siteRegistry } from '../core/site-registry';
import { GatewayRequest } from '../types/request-context';

const router = Router();

/**
 * ── Dynamic Site Proxy ──────────────────────────────────────
 *
 * Routes matching /api/v1/proxy/:siteId/* look up the target URL
 * from the site registry and forward traffic to that specific site.
 * The siteId is attached to the request context for audit logging.
 */
router.use('/:siteId/*', (req: Request, res: Response, next) => {
  const { siteId } = req.params;

  // Skip if it doesn't look like a site ID (avoid matching regular paths)
  const site = siteRegistry.getSite(siteId);
  if (!site) {
    // Not a registered site — fall through to the default proxy
    next('route');
    return;
  }

  if (!site.active) {
    res.status(410).json({
      error: 'Gone',
      message: `Target site "${siteId}" has been deactivated`,
    });
    return;
  }

  // Tag the request with siteId for audit logging
  (req as GatewayRequest).siteId = siteId;

  // Build dynamic proxy options for this specific site
  const targetUrl = site.targetUrl;

  const dynamicProxy = createProxyMiddleware({
    target: targetUrl,
    changeOrigin: true,
    pathRewrite: (path) => {
      // Strip /api/v1/proxy/:siteId prefix, keep the rest
      const stripped = path.replace(`/api/v1/proxy/${siteId}`, '') || '/';
      return stripped;
    },
    on: {
      proxyReq: (proxyReq, innerReq) => {
        const originalReq = innerReq as Request;
        logger.debug('SiteProxy: forwarding request', {
          siteId,
          method: originalReq.method,
          originalUrl: originalReq.originalUrl,
          target: targetUrl,
        });
        if (originalReq.body) {
          if (proxyReq.getHeader('transfer-encoding') === 'chunked') {
            proxyReq.removeHeader('transfer-encoding');
          }
          fixRequestBody(proxyReq, originalReq);
        }
      },
      proxyRes: (proxyRes, innerReq) => {
        const originalReq = innerReq as Request;
        logger.debug('SiteProxy: received response', {
          siteId,
          method: originalReq.method,
          originalUrl: originalReq.originalUrl,
          statusCode: proxyRes.statusCode,
        });
      },
      error: (err, innerReq, innerRes) => {
        const originalReq = innerReq as Request;
        logger.error('SiteProxy: upstream error', {
          siteId,
          method: originalReq.method,
          url: originalReq.originalUrl,
          error: err.message,
        });

        if (innerRes && 'status' in innerRes && typeof innerRes.status === 'function') {
          const expressRes = innerRes as Response;
          if (!expressRes.headersSent) {
            expressRes.status(502).json({
              error: 'Bad Gateway',
              message: `Target site "${siteId}" is unreachable`,
            });
          }
        }
      },
    },
    proxyTimeout: 30_000,
    timeout: 30_000,
  });

  dynamicProxy(req, res, next);
});

/**
 * ── Default Proxy ───────────────────────────────────────────
 *
 * Catch-all proxy route for the default UPSTREAM_TARGET.
 * Requests that pass risk evaluation are forwarded to the upstream target.
 */
const proxyOptions: Options = {
  target: env.UPSTREAM_TARGET,
  changeOrigin: true,
  pathRewrite: {
    '^/api/v1/proxy': '', // Strip the gateway prefix
  },
  on: {
    proxyReq: (proxyReq, req) => {
      const originalReq = req as Request;
      logger.debug('Proxy: forwarding request', {
        method: originalReq.method,
        originalUrl: originalReq.originalUrl,
        target: env.UPSTREAM_TARGET,
      });
      // Important: fix body parser consuming the stream
      if (originalReq.body) {
        // Remove chunked transfer encoding BEFORE fixRequestBody sets Content-Length and writes to stream.
        // Sending both causes HTTP Request Smuggling protection to return 400 Bad Request.
        if (proxyReq.getHeader('transfer-encoding') === 'chunked') {
          proxyReq.removeHeader('transfer-encoding');
        }
        fixRequestBody(proxyReq, originalReq);
      }
    },
    proxyRes: (proxyRes, req) => {
      const originalReq = req as Request;
      logger.debug('Proxy: received response', {
        method: originalReq.method,
        originalUrl: originalReq.originalUrl,
        statusCode: proxyRes.statusCode,
      });
    },
    error: (err, req, res) => {
      const originalReq = req as Request;
      logger.error('Proxy: upstream error', {
        method: originalReq.method,
        url: originalReq.originalUrl,
        error: err.message,
      });

      // Ensure we haven't already sent headers
      if (res && 'status' in res && typeof res.status === 'function') {
        const expressRes = res as Response;
        if (!expressRes.headersSent) {
          expressRes.status(502).json({
            error: 'Bad Gateway',
            message: 'Upstream service unavailable',
          });
        }
      }
    },
  },
  // Timeout settings
  proxyTimeout: 30_000,
  timeout: 30_000,
};

router.use('/', createProxyMiddleware(proxyOptions));

export default router;
