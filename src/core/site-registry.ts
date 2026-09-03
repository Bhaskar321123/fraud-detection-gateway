import { db } from '../config/database';
import { logger } from '../config/logger';
import crypto from 'crypto';

/**
 * Represents a registered target site that the gateway will proxy traffic to.
 */
export interface TargetSite {
  id: string;
  siteId: string;
  name: string;
  targetUrl: string;
  active: boolean;
  createdAt: string;
}

/**
 * Site Registry — In-memory + PostgreSQL backed store
 *
 * Maintains a fast in-memory cache of registered target sites.
 * All mutations are persisted to PostgreSQL and the cache is refreshed.
 */
class SiteRegistry {
  private sites: Map<string, TargetSite> = new Map();

  /**
   * Load all active sites from the database into memory.
   * Called once at startup.
   */
  async loadFromDb(): Promise<void> {
    try {
      const rows = await db('target_sites').where('active', true);
      this.sites.clear();

      for (const row of rows) {
        this.sites.set(row.site_id, {
          id: row.id,
          siteId: row.site_id,
          name: row.name,
          targetUrl: row.target_url,
          active: row.active,
          createdAt: row.created_at,
        });
      }

      logger.info(`SiteRegistry: loaded ${this.sites.size} active sites from database`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('SiteRegistry: failed to load sites from database', { error: message });
    }
  }

  /**
   * Register a new target site.
   * Generates a unique siteId slug from the hostname.
   */
  async registerSite(targetUrl: string): Promise<TargetSite> {
    // Validate URL
    let url: URL;
    try {
      url = new URL(targetUrl);
    } catch {
      throw new Error(`Invalid URL: ${targetUrl}`);
    }

    // Generate a short slug from hostname + random suffix
    const hostname = url.hostname.replace(/\./g, '-').replace(/[^a-z0-9-]/gi, '');
    const suffix = crypto.randomBytes(3).toString('hex'); // 6 chars
    const siteId = `${hostname.slice(0, 30)}-${suffix}`;
    const name = url.hostname;

    // Check for duplicate target URL
    for (const site of this.sites.values()) {
      if (site.targetUrl === targetUrl && site.active) {
        throw new Error(`Target URL already registered as site "${site.siteId}"`);
      }
    }

    // Persist to database
    const [row] = await db('target_sites')
      .insert({
        site_id: siteId,
        name,
        target_url: targetUrl,
        active: true,
      })
      .returning('*');

    const site: TargetSite = {
      id: row.id,
      siteId: row.site_id,
      name: row.name,
      targetUrl: row.target_url,
      active: row.active,
      createdAt: row.created_at,
    };

    // Update in-memory cache
    this.sites.set(siteId, site);
    logger.info('SiteRegistry: registered new site', { siteId, targetUrl, name });

    return site;
  }

  /**
   * Look up a site by its siteId (fast in-memory).
   */
  getSite(siteId: string): TargetSite | undefined {
    return this.sites.get(siteId);
  }

  /**
   * List all registered sites (active and inactive).
   */
  listSites(): TargetSite[] {
    return Array.from(this.sites.values());
  }

  /**
   * Deactivate a site by siteId.
   */
  async removeSite(siteId: string): Promise<boolean> {
    const site = this.sites.get(siteId);
    if (!site) return false;

    await db('target_sites')
      .where('site_id', siteId)
      .update({ active: false });

    this.sites.delete(siteId);
    logger.info('SiteRegistry: deactivated site', { siteId });
    return true;
  }
}

/** Singleton instance */
export const siteRegistry = new SiteRegistry();
