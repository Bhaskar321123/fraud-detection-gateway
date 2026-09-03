import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { env } from './config/env';
import { logger } from './config/logger';
import { redis } from './config/redis';
import { initializeDatabase, destroyDatabase } from './config/database';
import { gatewayMiddleware } from './core/gateway.middleware';
import { siteRegistry } from './core/site-registry';
import adminRoutes from './routes/admin.routes';
import proxyRoutes from './routes/proxy.routes';

/**
 * ╔═══════════════════════════════════════════════════════════╗
 * ║   Fraud Detection Gateway — Application Entry Point       ║
 * ╠═══════════════════════════════════════════════════════════╣
 * ║   Middleware stack (order matters):                        ║
 * ║   1. Security headers (Helmet)                            ║
 * ║   2. CORS                                                 ║
 * ║   3. Body parsers (JSON + URL-encoded)                    ║
 * ║   4. Health check (pre-gateway, always available)         ║
 * ║   5. Admin routes (pre-gateway, for dashboard access)     ║
 * ║   6. Gateway middleware (risk evaluation)                 ║
 * ║   7. Proxy routes (forwarded to upstream)                 ║
 * ║   8. Global error handler                                 ║
 * ╚═══════════════════════════════════════════════════════════╝
 */

const app = express();

// ── 1. Security headers ──────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // Gateway proxies varied content
}));

// ── 2. CORS ──────────────────────────────────────────────
app.use(cors({
  origin: env.NODE_ENV === 'production' ? false : '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Trace-Id'],
}));

// ── 3. Body parsers ──────────────────────────────────────
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// ── Trust proxy (for accurate IP extraction behind LB) ───
app.set('trust proxy', true);

// ── 4. Health check (always reachable, pre-gateway) ──────
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'fraud-detection-gateway',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// ── 5. Admin routes (pre-gateway, for dashboard) ─────────
app.use('/api/v1/admin', adminRoutes);

// ── 6. Gateway middleware (risk evaluation on all other routes)
app.use(gatewayMiddleware);

// ── 7. Proxy routes (forward to upstream) ────────────────
app.use('/api/v1/proxy', proxyRoutes);

// ── Catch-all for unmatched routes ───────────────────────
app.use((_req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: 'The requested route does not exist on this gateway',
  });
});

// ── 8. Global error handler ──────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
  });

  if (!res.headersSent) {
    res.status(500).json({
      error: 'Internal Server Error',
      message: env.NODE_ENV === 'production' ? 'An unexpected error occurred' : err.message,
    });
  }
});

// ──────────────────────────────────────────────────────────
// Server Bootstrap
// ──────────────────────────────────────────────────────────

async function bootstrap(): Promise<void> {
  logger.info('╔═══════════════════════════════════════════════╗');
  logger.info('║   Fraud Detection Gateway — Starting…         ║');
  logger.info('╚═══════════════════════════════════════════════╝');
  logger.info(`Environment: ${env.NODE_ENV}`);
  logger.info(`Fail mode:   ${env.FAIL_MODE}`);

  // Initialise database schema
  try {
    await initializeDatabase();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Database initialization failed: ${message}`);

    if (env.FAIL_MODE === 'secure') {
      logger.error('Fail-secure mode: shutting down due to DB failure');
      process.exit(1);
    }

    logger.warn('Fail-open mode: continuing without database');
  }

  // Load target sites into memory
  try {
    await siteRegistry.loadFromDb();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`Site registry load failed: ${message}`);
  }

  // Start HTTP server
  const server = app.listen(env.PORT, () => {
    logger.info(`🚀 Gateway listening on port ${env.PORT}`);
    logger.info(`   Health:  http://localhost:${env.PORT}/health`);
    logger.info(`   Admin:   http://localhost:${env.PORT}/api/v1/admin/health`);
    logger.info(`   Proxy:   http://localhost:${env.PORT}/api/v1/proxy/*`);
    logger.info(`   Target:  ${env.UPSTREAM_TARGET}`);
    logger.info(`   Thresholds: warn=${env.RISK_THRESHOLD_WARN}, block=${env.RISK_THRESHOLD_BLOCK}`);
  });

  // ── Graceful shutdown ──────────────────────────────────
  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`\n${signal} received — initiating graceful shutdown…`);

    server.close(async () => {
      logger.info('HTTP server closed');

      try {
        redis.disconnect();
        logger.info('Redis disconnected');
      } catch { /* swallow */ }

      try {
        await destroyDatabase();
      } catch { /* swallow */ }

      logger.info('Shutdown complete');
      process.exit(0);
    });

    // Force exit if graceful shutdown takes too long
    setTimeout(() => {
      logger.error('Graceful shutdown timed out — forcing exit');
      process.exit(1);
    }, 10_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Catch unhandled errors
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', { reason: String(reason) });
  });

  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', { error: error.message, stack: error.stack });
    process.exit(1);
  });
}

bootstrap().catch((error) => {
  logger.error('Bootstrap failed', { error: error instanceof Error ? error.message : String(error) });
  process.exit(1);
});

export default app;
