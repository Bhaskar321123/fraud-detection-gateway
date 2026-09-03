import knex, { Knex } from 'knex';
import { env } from './env';
import { logger } from './logger';

/**
 * Knex configuration for PostgreSQL.
 */
const knexConfig: Knex.Config = {
  client: 'pg',
  connection: {
    host: env.PG_HOST,
    port: env.PG_PORT,
    user: env.PG_USER,
    password: env.PG_PASSWORD,
    database: env.PG_DATABASE,
    ssl: env.PG_HOST.includes('supabase') ? { rejectUnauthorized: false } : false,
  },
  pool: {
    min: env.PG_POOL_MIN,
    max: env.PG_POOL_MAX,
    acquireTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
  },
  acquireConnectionTimeout: 10_000,
};

/** Singleton Knex instance */
export const db: Knex = knex(knexConfig);

/**
 * Ensure the audit_logs table exists.
 * Called once at startup — idempotent via `IF NOT EXISTS`.
 */
export async function initializeDatabase(): Promise<void> {
  try {
    const exists = await db.schema.hasTable('audit_logs');

    if (!exists) {
      await db.schema.createTable('audit_logs', (table) => {
        table.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
        table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(db.fn.now());
        table.string('client_ip', 45).notNullable().index();
        table.string('method', 10).notNullable();
        table.text('path').notNullable();
        table.integer('risk_score').notNullable();
        table.string('action', 20).notNullable(); // 'allowed' | 'warned' | 'blocked'
        table.jsonb('rule_results').notNullable(); // individual rule breakdown
        table.jsonb('request_meta').nullable();     // headers, user-agent, geo info
        table.string('user_id', 255).nullable().index();
        table.string('country', 2).nullable();
        table.string('city', 100).nullable();
        table.string('site_id', 50).nullable().index(); // multi-tenant site tag
      });

      logger.info('Database: created audit_logs table');
    } else {
      // Add site_id column if it doesn't exist (migration for existing installs)
      const hasSiteId = await db.schema.hasColumn('audit_logs', 'site_id');
      if (!hasSiteId) {
        await db.schema.alterTable('audit_logs', (table) => {
          table.string('site_id', 50).nullable().index();
        });
        logger.info('Database: added site_id column to audit_logs');
      }
    }

    // ── Target Sites table ──────────────────────────────────
    const sitesExist = await db.schema.hasTable('target_sites');
    if (!sitesExist) {
      await db.schema.createTable('target_sites', (table) => {
        table.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
        table.string('site_id', 50).notNullable().unique().index();
        table.string('name', 255).notNullable();
        table.text('target_url').notNullable();
        table.boolean('active').notNullable().defaultTo(true);
        table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(db.fn.now());
      });

      logger.info('Database: created target_sites table');
    }

    // Blocked-requests summary index for dashboard queries
    await db.raw(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_action_created
      ON audit_logs (action, created_at DESC)
    `);

    // Metrics aggregation index
    await db.raw(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
      ON audit_logs (created_at DESC)
    `);

    logger.info('Database: schema initialised successfully');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Database: schema initialisation failed', { error: message });
    throw error;
  }
}

/**
 * Health check — attempt a trivial query.
 */
export async function isDatabaseHealthy(): Promise<boolean> {
  try {
    await db.raw('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

/**
 * Graceful shutdown — destroy the connection pool.
 */
export async function destroyDatabase(): Promise<void> {
  await db.destroy();
  logger.info('Database: connection pool destroyed');
}
