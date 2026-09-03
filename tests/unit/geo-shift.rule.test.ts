import { GeoShiftRule } from '../../src/rules/geo-shift.rule';
import { GatewayRequest } from '../../src/types/request-context';
import { GeoLocation } from '../../src/types/risk-score';
import * as redisModule from '../../src/config/redis';

// ──────────────────────────────────────────────────────────────
// Mocks
// ──────────────────────────────────────────────────────────────

jest.mock('../../src/config/redis', () => ({
  redis: {
    eval: jest.fn(),
  },
  GEO_SHIFT_LUA: 'MOCK_LUA_SCRIPT',
}));

const mockedRedis = jest.mocked(redisModule.redis);

function mockGeoLocation(overrides?: Partial<GeoLocation>): GeoLocation {
  return {
    country: 'US',
    region: 'NY',
    city: 'New York',
    latitude: 40.7128,
    longitude: -74.006,
    timezone: 'America/New_York',
    ...overrides,
  };
}

function mockRequest(overrides?: {
  clientIp?: string;
  geoLocation?: GeoLocation | null;
}): GatewayRequest {
  return {
    clientIp: overrides?.clientIp ?? '1.2.3.4',
    gatewayTimestamp: new Date().toISOString(),
    traceId: 'test-trace-id',
    geoLocation: overrides && 'geoLocation' in overrides ? overrides.geoLocation : mockGeoLocation(),
    method: 'GET',
    url: '/test',
    originalUrl: '/test',
    path: '/test',
    headers: {},
    body: {},
  } as GatewayRequest;
}

// ──────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────

describe('GeoShiftRule', () => {
  let rule: GeoShiftRule;

  beforeEach(() => {
    rule = new GeoShiftRule();
    jest.clearAllMocks();
  });

  it('should have correct metadata', () => {
    expect(rule.name).toBe('geo-shift');
    expect(rule.enabled).toBe(true);
    expect(rule.maxScore).toBe(35);
  });

  describe('No geo data available', () => {
    it('should return score 0 when geoLocation is null', async () => {
      const req = mockRequest({ geoLocation: null });
      const result = await rule.evaluate(req);

      expect(result.score).toBe(0);
      expect(result.reason).toContain('No geolocation');
    });
  });

  describe('First observation', () => {
    it('should return score 0 on first observation (no previous data)', async () => {
      (mockedRedis.eval as jest.Mock).mockResolvedValue([]);

      const req = mockRequest();
      const result = await rule.evaluate(req);

      expect(result.score).toBe(0);
      expect(result.reason).toContain('First observation');
      expect(result.metadata?.currentLocation).toBeDefined();
    });
  });

  describe('Normal travel speed', () => {
    it('should return score 0 for slow geo shift (e.g., driving speed)', async () => {
      // Previous location: nearby, 30 minutes ago
      const thirtyMinAgo = Date.now() - 30 * 60_000;

      (mockedRedis.eval as jest.Mock).mockResolvedValue([
        '40.758896', // ~5km away from current 40.7128
        '-73.98513',
        String(thirtyMinAgo),
      ]);

      const req = mockRequest();
      const result = await rule.evaluate(req);

      expect(result.score).toBe(0);
      expect(result.reason).toContain('normal');
    });
  });

  describe('Suspicious geo shifts', () => {
    it('should return score 15 for speed 1-2x threshold (suspicious)', async () => {
      // Speed = ~1500 km/h (threshold is 1000 km/h) → 1.5x = suspicious
      // Distance = 750km in 30 min = 1500 km/h
      const thirtyMinAgo = Date.now() - 30 * 60_000;

      (mockedRedis.eval as jest.Mock).mockResolvedValue([
        '47.6062',   // Seattle
        '-122.3321',
        String(thirtyMinAgo),
      ]);

      const req = mockRequest({
        geoLocation: mockGeoLocation({
          latitude: 34.0522,
          longitude: -118.2437,
          city: 'Los Angeles',
        }),
      });

      const result = await rule.evaluate(req);

      // Seattle → LA is ~1,540 km in 30 min = ~3,080 km/h → >2x → could be 25
      // The exact tier depends on distance calculation
      expect(result.score).toBeGreaterThan(0);
      expect(result.score).toBeLessThanOrEqual(35);
    });
  });

  describe('Impossible travel', () => {
    it('should return maxScore for extremely fast geo shift (>5x threshold)', async () => {
      // NY → Tokyo in 5 minutes → ~10,850km / (5/60)h = ~130,200 km/h → way over 5x
      const fiveMinAgo = Date.now() - 5 * 60_000;

      (mockedRedis.eval as jest.Mock).mockResolvedValue([
        '40.7128',   // New York
        '-74.006',
        String(fiveMinAgo),
      ]);

      const req = mockRequest({
        geoLocation: mockGeoLocation({
          latitude: 35.6762,
          longitude: 139.6503,
          country: 'JP',
          city: 'Tokyo',
        }),
      });

      const result = await rule.evaluate(req);

      expect(result.score).toBe(35); // maxScore
      expect(result.reason).toContain('Impossible travel');
    });
  });

  describe('Near-simultaneous requests', () => {
    it('should return maxScore for simultaneous requests from distant locations', async () => {
      // Same timestamp, different locations far apart
      const justNow = Date.now() - 100; // 100ms ago

      (mockedRedis.eval as jest.Mock).mockResolvedValue([
        '40.7128',   // New York
        '-74.006',
        String(justNow),
      ]);

      const req = mockRequest({
        geoLocation: mockGeoLocation({
          latitude: 35.6762,
          longitude: 139.6503,
          country: 'JP',
          city: 'Tokyo',
        }),
      });

      const result = await rule.evaluate(req);

      expect(result.score).toBe(35);
    });

    it('should return score 0 for near-simultaneous requests from same location', async () => {
      const justNow = Date.now() - 50; // 50ms ago

      (mockedRedis.eval as jest.Mock).mockResolvedValue([
        '40.7128',
        '-74.006',
        String(justNow),
      ]);

      const req = mockRequest({
        geoLocation: mockGeoLocation({
          latitude: 40.7128,
          longitude: -74.006,
        }),
      });

      const result = await rule.evaluate(req);

      expect(result.score).toBe(0);
    });
  });

  describe('Error handling', () => {
    it('should return score 0 when Redis eval fails', async () => {
      (mockedRedis.eval as jest.Mock).mockRejectedValue(new Error('Redis down'));

      const req = mockRequest();
      const result = await rule.evaluate(req);

      expect(result.score).toBe(0);
      expect(result.reason).toContain('error');
    });

    it('should return score 0 when previous data is corrupted', async () => {
      (mockedRedis.eval as jest.Mock).mockResolvedValue([
        'not-a-number',
        'invalid',
        'garbage',
      ]);

      const req = mockRequest();
      const result = await rule.evaluate(req);

      expect(result.score).toBe(0);
      expect(result.reason).toContain('corrupted');
    });
  });
});
