import { DetectionRule } from '../types/rule.interface';
import { GatewayRequest } from '../types/request-context';
import { RuleResult } from '../types/risk-score';
import { redis, GEO_SHIFT_LUA } from '../config/redis';
import { env } from '../config/env';
import { haversineDistanceKm } from '../utils/geoip';
import { logger } from '../config/logger';

/**
 * Geo-Shift Detection Rule
 *
 * Detects physically impossible geographic jumps within short time windows.
 * For example, a user appearing in New York and then Tokyo 5 minutes later
 * is traveling at ~2,000 km/h — well above the configurable threshold.
 *
 * Uses an atomic Redis Lua script to store & retrieve the previous geo observation
 * per identifier (IP or user ID), then calculates implied travel speed via Haversine.
 *
 * Scoring:
 *  - Speed ≤ threshold → score 0
 *  - Speed 1–2x threshold → score 15 (suspicious)
 *  - Speed 2–5x threshold → score 25 (very suspicious)
 *  - Speed > 5x threshold → score 35 (maxScore, impossible travel)
 */
export class GeoShiftRule implements DetectionRule {
  readonly name = 'geo-shift';
  readonly description = 'Detects impossible geographic location jumps within short time windows';
  enabled = true;
  readonly maxScore = 35;

  async evaluate(req: GatewayRequest): Promise<RuleResult> {
    try {
      const geo = req.geoLocation;

      // No geo data — can't evaluate, return benign
      if (!geo) {
        return {
          rule: this.name,
          reason: 'No geolocation data available for this IP',
          score: 0,
        };
      }

      // Use user ID if available, otherwise fall back to IP
      const identifier = req.clientIp;
      const nowMs = Date.now();

      // Atomic: get previous location and store current one
      const previousData = await redis.eval(
        GEO_SHIFT_LUA,
        1,
        `geo:${identifier}`,
        String(geo.latitude),
        String(geo.longitude),
        String(nowMs),
        String(env.GEO_SHIFT_WINDOW_MS)
      ) as string[];

      // First observation — no previous data to compare
      if (!previousData || previousData.length === 0) {
        return {
          rule: this.name,
          reason: 'First observation — establishing geo baseline',
          score: 0,
          metadata: {
            currentLocation: { lat: geo.latitude, lon: geo.longitude, country: geo.country },
          },
        };
      }

      const [prevLatStr, prevLonStr, prevTsStr] = previousData;
      const prevLat = parseFloat(prevLatStr);
      const prevLon = parseFloat(prevLonStr);
      const prevTs = parseInt(prevTsStr, 10);

      // Sanity check: ensure parsed values are valid
      if (isNaN(prevLat) || isNaN(prevLon) || isNaN(prevTs)) {
        return {
          rule: this.name,
          reason: 'Previous geo data corrupted — skipping evaluation',
          score: 0,
        };
      }

      // Calculate distance and implied speed
      const distanceKm = haversineDistanceKm(prevLat, prevLon, geo.latitude, geo.longitude);
      const elapsedMs = nowMs - prevTs;
      const elapsedHours = elapsedMs / 3_600_000;

      // Avoid division by zero for near-simultaneous requests
      if (elapsedHours <= 0.0001) {
        // Less than ~0.36 seconds — same location expected
        const score = distanceKm > 10 ? this.maxScore : 0;
        return {
          rule: this.name,
          reason: score > 0
            ? `Near-simultaneous requests from ${distanceKm.toFixed(0)}km apart`
            : 'Near-simultaneous request from same location',
          score,
          metadata: { distanceKm, elapsedMs },
        };
      }

      const impliedSpeedKmh = distanceKm / elapsedHours;
      const speedRatio = impliedSpeedKmh / env.GEO_SHIFT_MAX_SPEED_KMH;

      // Determine score based on speed ratio
      let score = 0;
      let reason = '';

      if (speedRatio <= 1) {
        reason = `Geo shift within normal limits (${impliedSpeedKmh.toFixed(0)} km/h)`;
      } else if (speedRatio <= 2) {
        score = 15;
        reason = `Suspicious geo shift: ${distanceKm.toFixed(0)}km in ${(elapsedMs / 1000).toFixed(0)}s (${impliedSpeedKmh.toFixed(0)} km/h)`;
      } else if (speedRatio <= 5) {
        score = 25;
        reason = `Very suspicious geo shift: ${distanceKm.toFixed(0)}km in ${(elapsedMs / 1000).toFixed(0)}s (${impliedSpeedKmh.toFixed(0)} km/h)`;
      } else {
        score = this.maxScore;
        reason = `Impossible travel detected: ${distanceKm.toFixed(0)}km in ${(elapsedMs / 1000).toFixed(0)}s (${impliedSpeedKmh.toFixed(0)} km/h)`;
      }

      if (score > 0) {
        logger.debug('GeoShiftRule: anomalous geo shift detected', {
          ip: req.clientIp,
          distanceKm: distanceKm.toFixed(1),
          elapsedMs,
          impliedSpeedKmh: impliedSpeedKmh.toFixed(0),
          score,
        });
      }

      return {
        rule: this.name,
        reason,
        score,
        metadata: {
          previousLocation: { lat: prevLat, lon: prevLon },
          currentLocation: { lat: geo.latitude, lon: geo.longitude, country: geo.country },
          distanceKm: Math.round(distanceKm),
          elapsedMs,
          impliedSpeedKmh: Math.round(impliedSpeedKmh),
          thresholdKmh: env.GEO_SHIFT_MAX_SPEED_KMH,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('GeoShiftRule: evaluation failed', { error: message });

      return {
        rule: this.name,
        reason: 'Geo-shift evaluation error — defaulting to safe score',
        score: 0,
      };
    }
  }
}

/** Singleton instance */
export const geoShiftRule = new GeoShiftRule();
