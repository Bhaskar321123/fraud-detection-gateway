import geoip from 'geoip-lite';
import { GeoLocation } from '../types/risk-score';
import { logger } from '../config/logger';

/**
 * Resolve an IP address to a geographic location using the geoip-lite database.
 *
 * geoip-lite uses the MaxMind GeoLite2 database bundled in-process, so lookups
 * are synchronous and sub-millisecond — no external API calls.
 *
 * @param ip - IPv4 or IPv6 address to look up.
 * @returns GeoLocation if resolvable, null for private/localhost/unknown IPs.
 */
export function resolveGeoLocation(ip: string): GeoLocation | null {
  try {
    if (!ip || ip === 'unknown' || ip === '127.0.0.1' || ip === '::1') {
      return null;
    }

    const geo = geoip.lookup(ip);

    if (!geo || !geo.ll || geo.ll.length < 2) {
      return null;
    }

    return {
      country: geo.country || 'XX',
      region: geo.region || '',
      city: geo.city || '',
      latitude: geo.ll[0],
      longitude: geo.ll[1],
      timezone: geo.timezone || '',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('GeoIP lookup failed', { ip, error: message });
    return null;
  }
}

/**
 * Calculate the great-circle distance between two points using the Haversine formula.
 *
 * @param lat1 - Latitude of point 1 (degrees)
 * @param lon1 - Longitude of point 1 (degrees)
 * @param lat2 - Latitude of point 2 (degrees)
 * @param lon2 - Longitude of point 2 (degrees)
 * @returns Distance in kilometres
 */
export function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const EARTH_RADIUS_KM = 6371;

  const toRad = (deg: number): number => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_KM * c;
}
