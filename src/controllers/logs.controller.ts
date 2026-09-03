import { Request, Response } from 'express';
import { db } from '../config/database';
import { logger } from '../config/logger';

/**
 * GET /api/v1/admin/logs
 *
 * Retrieves paginated audit log entries with optional filters.
 *
 * Query params:
 *  - page:    page number (default: 1)
 *  - limit:   entries per page (default: 50, max: 200)
 *  - action:  filter by action ('allowed' | 'warned' | 'blocked')
 *  - ip:      filter by client IP (exact match)
 *  - from:    ISO-8601 start date
 *  - to:      ISO-8601 end date
 *  - minScore: minimum risk score filter
 */
export async function getAuditLogs(req: Request, res: Response): Promise<void> {
  try {
    const page = Math.max(1, parseInt(req.query['page'] as string, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query['limit'] as string, 10) || 50));
    const offset = (page - 1) * limit;

    const action = req.query['action'] as string | undefined;
    const ip = req.query['ip'] as string | undefined;
    const from = req.query['from'] as string | undefined;
    const to = req.query['to'] as string | undefined;
    const minScore = parseInt(req.query['minScore'] as string, 10) || undefined;
    const siteId = req.query['siteId'] as string | undefined;

    // Build query with filters
    let query = db('audit_logs').orderBy('created_at', 'desc');
    let countQuery = db('audit_logs');

    if (action) {
      query = query.where('action', action);
      countQuery = countQuery.where('action', action);
    }

    if (ip) {
      query = query.where('client_ip', ip);
      countQuery = countQuery.where('client_ip', ip);
    }

    if (from) {
      query = query.where('created_at', '>=', from);
      countQuery = countQuery.where('created_at', '>=', from);
    }

    if (to) {
      query = query.where('created_at', '<=', to);
      countQuery = countQuery.where('created_at', '<=', to);
    }

    if (minScore !== undefined) {
      query = query.where('risk_score', '>=', minScore);
      countQuery = countQuery.where('risk_score', '>=', minScore);
    }

    if (siteId) {
      query = query.where('site_id', siteId);
      countQuery = countQuery.where('site_id', siteId);
    }

    // Execute paginated query and count in parallel
    const [logs, [{ count: totalStr }]] = await Promise.all([
      query.limit(limit).offset(offset),
      countQuery.count('* as count'),
    ]);

    const total = typeof totalStr === 'string' ? parseInt(totalStr, 10) : Number(totalStr);

    res.json({
      success: true,
      data: {
        logs,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNext: page * limit < total,
          hasPrev: page > 1,
        },
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('LogsController: failed to fetch audit logs', { error: message });

    res.status(500).json({
      success: false,
      error: 'Failed to retrieve audit logs',
    });
  }
}

/**
 * GET /api/v1/admin/logs/:id
 *
 * Retrieve a single audit log entry by UUID.
 */
export async function getAuditLogById(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    if (!id) {
      res.status(400).json({ success: false, error: 'Log ID is required' });
      return;
    }

    const log = await db('audit_logs').where('id', id).first();

    if (!log) {
      res.status(404).json({ success: false, error: 'Audit log not found' });
      return;
    }

    res.json({ success: true, data: log });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('LogsController: failed to fetch audit log by ID', { error: message });

    res.status(500).json({
      success: false,
      error: 'Failed to retrieve audit log',
    });
  }
}

/**
 * DELETE /api/v1/admin/logs
 *
 * Purge audit logs older than a specified number of days.
 *
 * Query params:
 *  - olderThanDays: number of days (default: 30)
 */
export async function purgeAuditLogs(req: Request, res: Response): Promise<void> {
  try {
    const olderThanDays = parseInt(req.query['olderThanDays'] as string, 10) || 30;
    const cutoffDate = new Date(Date.now() - olderThanDays * 86_400_000).toISOString();

    const deletedCount = await db('audit_logs')
      .where('created_at', '<', cutoffDate)
      .delete();

    logger.info('LogsController: purged old audit logs', { olderThanDays, deletedCount });

    res.json({
      success: true,
      data: {
        deletedCount,
        cutoffDate,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('LogsController: failed to purge audit logs', { error: message });

    res.status(500).json({
      success: false,
      error: 'Failed to purge audit logs',
    });
  }
}
