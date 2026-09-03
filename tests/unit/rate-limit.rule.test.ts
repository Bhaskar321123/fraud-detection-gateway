import { RateLimitRule } from '../../src/rules/rate-limit.rule';
import { GatewayRequest } from '../../src/types/request-context';
import * as tokenBucket from '../../src/core/token-bucket';

// ──────────────────────────────────────────────────────────────
// Mocks
// ──────────────────────────────────────────────────────────────

jest.mock('../../src/core/token-bucket');

const mockedConsumeToken = jest.mocked(tokenBucket.consumeToken);

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

describe('RateLimitRule', () => {
  let rule: RateLimitRule;

  beforeEach(() => {
    rule = new RateLimitRule();
    jest.clearAllMocks();
  });

  it('should have correct metadata', () => {
    expect(rule.name).toBe('rate-limit');
    expect(rule.enabled).toBe(true);
    expect(rule.maxScore).toBe(100);
  });

  describe('Bucket fully available', () => {
    it('should return score 0 when bucket is full', async () => {
      mockedConsumeToken.mockResolvedValue({
        allowed: true,
        remainingTokens: 99, // Out of 100 — nearly full
        retryAfterMs: 0,
      });

      const result = await rule.evaluate(mockRequest());

      expect(result.score).toBe(0);
      expect(result.rule).toBe('rate-limit');
      expect(result.reason).toContain('normal');
    });

    it('should return score 0 when bucket is above 50%', async () => {
      mockedConsumeToken.mockResolvedValue({
        allowed: true,
        remainingTokens: 60, // 60% remaining
        retryAfterMs: 0,
      });

      const result = await rule.evaluate(mockRequest());

      expect(result.score).toBe(0);
    });
  });

  describe('Bucket depleting', () => {
    it('should return graduated score when bucket drops below 50%', async () => {
      mockedConsumeToken.mockResolvedValue({
        allowed: true,
        remainingTokens: 20, // 20% remaining → 80% depleted
        retryAfterMs: 0,
      });

      const result = await rule.evaluate(mockRequest());

      // depletionRatio = 0.8, so score = round(100 * ((0.8 - 0.5) / 0.5)) = round(100 * 0.6) = 60
      expect(result.score).toBeGreaterThan(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(result.reason).toContain('Elevated');
    });

    it('should return higher score as bucket empties further', async () => {
      mockedConsumeToken.mockResolvedValue({
        allowed: true,
        remainingTokens: 5, // 5% remaining → 95% depleted
        retryAfterMs: 0,
      });

      const result = await rule.evaluate(mockRequest());

      // depletionRatio = 0.95, so score = round(100 * ((0.95 - 0.5) / 0.5)) = round(100 * 0.9) = 90
      expect(result.score).toBe(90);
    });
  });

  describe('Bucket exhausted', () => {
    it('should return maxScore when bucket is exhausted', async () => {
      mockedConsumeToken.mockResolvedValue({
        allowed: false,
        remainingTokens: 0,
        retryAfterMs: 5000,
      });

      const result = await rule.evaluate(mockRequest());

      expect(result.score).toBe(100);
      expect(result.reason).toContain('exceeded');
      expect(result.metadata?.retryAfterMs).toBe(5000);
    });
  });

  describe('Error handling', () => {
    it('should return score 0 when consumeToken throws', async () => {
      mockedConsumeToken.mockRejectedValue(new Error('Redis connection failed'));

      const result = await rule.evaluate(mockRequest());

      expect(result.score).toBe(0);
      expect(result.reason).toContain('error');
    });
  });

  describe('Uses client IP as bucket key', () => {
    it('should pass the clientIp to consumeToken', async () => {
      mockedConsumeToken.mockResolvedValue({
        allowed: true,
        remainingTokens: 50,
        retryAfterMs: 0,
      });

      await rule.evaluate(mockRequest({ clientIp: '99.88.77.66' }));

      expect(mockedConsumeToken).toHaveBeenCalledWith('99.88.77.66');
    });
  });
});
