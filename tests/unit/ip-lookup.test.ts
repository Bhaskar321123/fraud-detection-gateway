import { extractClientIp } from '../../src/utils/ip-lookup';
import { Request } from 'express';

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

function mockRequest(overrides?: {
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: { remoteAddress?: string };
}): Request {
  return {
    headers: overrides?.headers ?? {},
    ip: overrides?.ip,
    socket: overrides?.socket ?? { remoteAddress: undefined },
  } as unknown as Request;
}

// ──────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────

describe('extractClientIp', () => {
  describe('Proxy header parsing', () => {
    it('should extract IP from cf-connecting-ip header', () => {
      const req = mockRequest({ headers: { 'cf-connecting-ip': '8.8.8.8' } });
      expect(extractClientIp(req)).toBe('8.8.8.8');
    });

    it('should extract IP from x-real-ip header', () => {
      const req = mockRequest({ headers: { 'x-real-ip': '1.2.3.4' } });
      expect(extractClientIp(req)).toBe('1.2.3.4');
    });

    it('should extract first public IP from x-forwarded-for chain', () => {
      const req = mockRequest({
        headers: { 'x-forwarded-for': '203.0.113.50, 10.0.0.1, 10.0.0.2' },
      });
      expect(extractClientIp(req)).toBe('203.0.113.50');
    });

    it('should skip private IPs in x-forwarded-for and return first public IP', () => {
      const req = mockRequest({
        headers: { 'x-forwarded-for': '10.0.0.1, 192.168.1.1, 44.55.66.77' },
      });
      expect(extractClientIp(req)).toBe('44.55.66.77');
    });

    it('should return private IP when all IPs in chain are private', () => {
      const req = mockRequest({
        headers: { 'x-forwarded-for': '10.0.0.1, 192.168.1.1' },
      });
      expect(extractClientIp(req)).toBe('10.0.0.1');
    });

    it('should extract IP from x-client-ip header', () => {
      const req = mockRequest({ headers: { 'x-client-ip': '5.6.7.8' } });
      expect(extractClientIp(req)).toBe('5.6.7.8');
    });

    it('should extract IP from true-client-ip header', () => {
      const req = mockRequest({ headers: { 'true-client-ip': '9.10.11.12' } });
      expect(extractClientIp(req)).toBe('9.10.11.12');
    });

    it('should prioritize cf-connecting-ip over x-forwarded-for', () => {
      const req = mockRequest({
        headers: {
          'cf-connecting-ip': '1.1.1.1',
          'x-forwarded-for': '2.2.2.2',
        },
      });
      expect(extractClientIp(req)).toBe('1.1.1.1');
    });
  });

  describe('IPv6-mapped IPv4 normalization', () => {
    it('should strip ::ffff: prefix from IPv6-mapped IPv4 addresses', () => {
      const req = mockRequest({
        headers: { 'x-forwarded-for': '::ffff:192.0.2.1' },
      });
      // After normalization, 192.0.2.1 is public
      expect(extractClientIp(req)).toBe('192.0.2.1');
    });

    it('should strip ::ffff: prefix from req.ip', () => {
      const req = mockRequest({ ip: '::ffff:10.0.0.5' });
      expect(extractClientIp(req)).toBe('10.0.0.5');
    });
  });

  describe('Fallback behavior', () => {
    it('should fall back to req.ip when no proxy headers are present', () => {
      const req = mockRequest({ ip: '100.200.100.200' });
      expect(extractClientIp(req)).toBe('100.200.100.200');
    });

    it('should fall back to req.socket.remoteAddress when req.ip is undefined', () => {
      const req = mockRequest({
        ip: undefined,
        socket: { remoteAddress: '172.16.0.1' },
      });
      // 172.16.x.x is private but it's the only source
      expect(extractClientIp(req)).toBe('172.16.0.1');
    });

    it('should return "unknown" when all sources are empty', () => {
      const req = mockRequest({
        ip: undefined,
        socket: { remoteAddress: undefined },
      });
      expect(extractClientIp(req)).toBe('unknown');
    });
  });

  describe('Edge cases', () => {
    it('should handle whitespace in x-forwarded-for values', () => {
      const req = mockRequest({
        headers: { 'x-forwarded-for': '  8.8.4.4  ,  10.0.0.1  ' },
      });
      expect(extractClientIp(req)).toBe('8.8.4.4');
    });

    it('should handle empty x-forwarded-for header', () => {
      const req = mockRequest({
        headers: { 'x-forwarded-for': '' },
        ip: '99.88.77.66',
      });
      expect(extractClientIp(req)).toBe('99.88.77.66');
    });

    it('should handle array-valued headers', () => {
      const req = mockRequest({
        headers: { 'x-forwarded-for': ['4.3.2.1', '5.6.7.8'] as unknown as string },
      });
      expect(extractClientIp(req)).toBe('4.3.2.1');
    });
  });
});
