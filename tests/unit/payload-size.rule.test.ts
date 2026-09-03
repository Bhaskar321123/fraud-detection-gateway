import { PayloadSizeRule } from '../../src/rules/payload-size.rule';
import { GatewayRequest } from '../../src/types/request-context';

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

function mockRequest(overrides?: {
  body?: unknown;
  headers?: Record<string, string>;
  originalUrl?: string;
  url?: string;
}): GatewayRequest {
  return {
    clientIp: '1.2.3.4',
    gatewayTimestamp: new Date().toISOString(),
    traceId: 'test-trace-id',
    geoLocation: null,
    method: 'POST',
    url: overrides?.url ?? '/test',
    originalUrl: overrides?.originalUrl ?? '/test',
    path: '/test',
    headers: overrides?.headers ?? { 'content-type': 'application/json' },
    body: overrides?.body ?? {},
  } as GatewayRequest;
}

// ──────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────

describe('PayloadSizeRule', () => {
  let rule: PayloadSizeRule;

  beforeEach(() => {
    rule = new PayloadSizeRule();
  });

  it('should have correct metadata', () => {
    expect(rule.name).toBe('payload-size');
    expect(rule.enabled).toBe(true);
    expect(rule.maxScore).toBe(30);
  });

  describe('Clean requests', () => {
    it('should return score 0 for a clean JSON body', async () => {
      const req = mockRequest({ body: { username: 'alice', age: 25 } });
      const result = await rule.evaluate(req);

      expect(result.score).toBe(0);
      expect(result.rule).toBe('payload-size');
      expect(result.reason).toContain('normal');
    });

    it('should return score 0 for an empty body', async () => {
      const req = mockRequest({ body: null });
      const result = await rule.evaluate(req);

      expect(result.score).toBe(0);
    });

    it('should return score 0 for a GET request with no body', async () => {
      const req = mockRequest({ body: undefined, originalUrl: '/api/users?page=1' });
      const result = await rule.evaluate(req);

      expect(result.score).toBe(0);
    });
  });

  describe('SQL Injection detection', () => {
    it('should detect OR 1=1 tautology', async () => {
      const req = mockRequest({ body: { input: "admin' OR 1=1 --" } });
      const result = await rule.evaluate(req);

      expect(result.score).toBeGreaterThan(0);
      expect(result.reason).toContain('Suspicious');
    });

    it('should detect UNION SELECT injection', async () => {
      const req = mockRequest({ body: { query: 'UNION ALL SELECT * FROM users' } });
      const result = await rule.evaluate(req);

      expect(result.score).toBeGreaterThan(0);
    });

    it('should detect DROP TABLE statements', async () => {
      const req = mockRequest({ body: { data: "; DROP TABLE users; --" } });
      const result = await rule.evaluate(req);

      expect(result.score).toBeGreaterThan(0);
    });

    it('should detect SQL comment injection', async () => {
      const req = mockRequest({ body: { field: "value'; -- " } });
      const result = await rule.evaluate(req);

      expect(result.score).toBeGreaterThan(0);
    });
  });

  describe('XSS detection', () => {
    it('should detect script tags', async () => {
      const req = mockRequest({ body: { comment: '<script>alert("xss")</script>' } });
      const result = await rule.evaluate(req);

      expect(result.score).toBeGreaterThan(0);
    });

    it('should detect javascript: protocol', async () => {
      const req = mockRequest({ body: { url: 'javascript: alert(1)' } });
      const result = await rule.evaluate(req);

      expect(result.score).toBeGreaterThan(0);
    });

    it('should detect event handler XSS', async () => {
      const req = mockRequest({ body: { name: '<div onmouseover=alert(1)>' } });
      const result = await rule.evaluate(req);

      expect(result.score).toBeGreaterThan(0);
    });

    it('should detect img onerror XSS', async () => {
      const req = mockRequest({ body: { avatar: '<img src=x onerror=alert(1)>' } });
      const result = await rule.evaluate(req);

      expect(result.score).toBeGreaterThan(0);
    });

    it('should detect iframe injection', async () => {
      const req = mockRequest({ body: { content: '<iframe src="evil.com"></iframe>' } });
      const result = await rule.evaluate(req);

      expect(result.score).toBeGreaterThan(0);
    });
  });

  describe('Path traversal detection', () => {
    it('should detect ../ path traversal in body', async () => {
      const req = mockRequest({ body: { file: '../../../../etc/passwd' } });
      const result = await rule.evaluate(req);

      expect(result.score).toBeGreaterThan(0);
    });

    it('should detect ../ path traversal in URL', async () => {
      const req = mockRequest({
        body: null,
        originalUrl: '/api/files/../../../../etc/shadow',
      });
      const result = await rule.evaluate(req);

      expect(result.score).toBeGreaterThan(0);
    });
  });

  describe('Command injection detection', () => {
    it('should detect shell command injection', async () => {
      const req = mockRequest({ body: { hostname: '; cat /etc/passwd' } });
      const result = await rule.evaluate(req);

      expect(result.score).toBeGreaterThan(0);
    });

    it('should detect command substitution', async () => {
      const req = mockRequest({ body: { input: '$(whoami)' } });
      const result = await rule.evaluate(req);

      expect(result.score).toBeGreaterThan(0);
    });
  });

  describe('Oversized payloads', () => {
    it('should flag payloads exceeding MAX_PAYLOAD_SIZE_BYTES', async () => {
      const req = mockRequest({
        headers: {
          'content-type': 'application/json',
          'content-length': '2000000', // 2MB > default 1MB limit
        },
        body: { data: 'x' },
      });

      const result = await rule.evaluate(req);

      expect(result.score).toBeGreaterThan(0);
      expect(result.metadata?.detectedPatterns).toContainEqual(
        expect.stringContaining('Oversized')
      );
    });
  });

  describe('Score capping', () => {
    it('should cap score at maxScore (30)', async () => {
      // Combine multiple high-weight patterns to exceed 30
      const req = mockRequest({
        body: {
          field1: "admin' OR 1=1 --",
          field2: '<script>alert(1)</script>',
          field3: '; cat /etc/passwd',
          field4: 'UNION ALL SELECT * FROM users',
        },
      });

      const result = await rule.evaluate(req);

      expect(result.score).toBeLessThanOrEqual(30);
    });
  });

  describe('String body handling', () => {
    it('should handle string body directly', async () => {
      const req = mockRequest({ body: "<script>alert('xss')</script>" });
      const result = await rule.evaluate(req);

      expect(result.score).toBeGreaterThan(0);
    });
  });
});
