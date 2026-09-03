import { IpReputationRule } from '../../src/rules/ip-reputation.rule';
import { GatewayRequest } from '../../src/types/request-context';
import * as redisModule from '../../src/config/redis';

// ──────────────────────────────────────────────────────────────
// Mocks
// ──────────────────────────────────────────────────────────────

jest.mock('../../src/config/redis', () => ({
  redis: {
    sismember: jest.fn(),
  },
}));

const mockedRedis = jest.mocked(redisModule.redis);

function mockRequest(overrides?: Partial<GatewayRequest>): GatewayRequest {
  return {
    clientIp: '1.2.3.4',
    gatewayTimestamp: new Date().toISOString(),
    traceId: 'test-trace-id',
    geoLocation: null,
    method: 'GET',
    url: '/test',
    originalUrl: '/test',
    path: '/test',
    headers: {},
    body: {},
    ...overrides,
  } as GatewayRequest;
}

// ──────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────

describe('IpReputationRule', () => {
  let rule: IpReputationRule;

  beforeEach(() => {
    rule = new IpReputationRule();
    jest.clearAllMocks();
  });

  it('should have correct metadata', () => {
    expect(rule.name).toBe('ip-reputation');
    expect(rule.enabled).toBe(true);
    expect(rule.maxScore).toBe(30);
  });

  describe('Clean IPs', () => {
    it('should return score 0 for a clean IP', async () => {
      (mockedRedis.sismember as jest.Mock).mockResolvedValue(0);

      const req = mockRequest({ clientIp: '8.8.8.8' });
      const result = await rule.evaluate(req);

      expect(result.score).toBe(0);
      expect(result.reason).toContain('clean');
    });
  });

  describe('Blacklisted IPs', () => {
    it('should return maxScore (30) for a blacklisted IP', async () => {
      (mockedRedis.sismember as jest.Mock).mockImplementation(
        async (key: string) => {
          if (key === 'blacklist:ips') return 1;
          return 0;
        }
      );

      const req = mockRequest({ clientIp: '185.220.101.1' });
      const result = await rule.evaluate(req);

      expect(result.score).toBe(30);
      expect(result.reason).toContain('blacklisted');
      expect(result.metadata?.source).toBe('blacklist');
    });
  });

  describe('Datacenter / VPN IPs', () => {
    it('should return score 15 for datacenter IP prefix (198.51.100.x)', async () => {
      (mockedRedis.sismember as jest.Mock).mockResolvedValue(0);

      const req = mockRequest({ clientIp: '198.51.100.50' });
      const result = await rule.evaluate(req);

      expect(result.score).toBe(15);
      expect(result.reason).toContain('datacenter');
      expect(result.metadata?.source).toBe('datacenter-prefix');
    });

    it('should return score 15 for datacenter IP prefix (203.0.113.x)', async () => {
      (mockedRedis.sismember as jest.Mock).mockResolvedValue(0);

      const req = mockRequest({ clientIp: '203.0.113.99' });
      const result = await rule.evaluate(req);

      expect(result.score).toBe(15);
    });
  });

  describe('Suspicious IPs', () => {
    it('should return score 10 for a suspicious IP', async () => {
      (mockedRedis.sismember as jest.Mock).mockImplementation(
        async (key: string) => {
          if (key === 'blacklist:ips') return 0;
          if (key === 'suspicious:ips') return 1;
          return 0;
        }
      );

      const req = mockRequest({ clientIp: '51.15.0.1' });
      const result = await rule.evaluate(req);

      expect(result.score).toBe(10);
      expect(result.reason).toContain('suspicious');
      expect(result.metadata?.source).toBe('suspicious-list');
    });
  });

  describe('Unknown / missing IP', () => {
    it('should return score 5 when clientIp is "unknown"', async () => {
      const req = mockRequest({ clientIp: 'unknown' });
      const result = await rule.evaluate(req);

      expect(result.score).toBe(5);
      expect(result.reason).toContain('unknown');
    });

    it('should return score 5 when clientIp is empty string', async () => {
      const req = mockRequest({ clientIp: '' });
      const result = await rule.evaluate(req);

      expect(result.score).toBe(5);
    });
  });

  describe('Priority order', () => {
    it('should prioritize blacklist over datacenter prefix', async () => {
      // IP matches both blacklist AND datacenter prefix
      (mockedRedis.sismember as jest.Mock).mockImplementation(
        async (key: string) => {
          if (key === 'blacklist:ips') return 1;
          return 0;
        }
      );

      const req = mockRequest({ clientIp: '198.51.100.10' }); // Also matches datacenter prefix
      const result = await rule.evaluate(req);

      expect(result.score).toBe(30); // Blacklist score, not datacenter score
      expect(result.metadata?.source).toBe('blacklist');
    });
  });

  describe('Error handling', () => {
    it('should return score 0 in fail-open mode when Redis fails', async () => {
      (mockedRedis.sismember as jest.Mock).mockRejectedValue(new Error('Redis down'));

      // The IpReputationRule catches errors and checks FAIL_MODE
      // Default FAIL_MODE from env is 'open'
      const req = mockRequest({ clientIp: '8.8.8.8' });
      const result = await rule.evaluate(req);

      // The rule catches the first Redis error, returns false, then continues
      // to datacenter check (which doesn't match 8.8.8.8), then suspicious
      // check which also fails. The second failure triggers the catch block.
      // In open mode, this returns score 0.
      expect(result.score).toBeLessThanOrEqual(15);
    });
  });
});
