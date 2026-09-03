import { Request } from 'express';

/**
 * Trusted proxy headers in priority order.
 * The first non-empty, non-private IP found is used.
 */
const PROXY_HEADERS = [
  'cf-connecting-ip',    // Cloudflare
  'x-real-ip',           // Nginx
  'x-forwarded-for',     // Generic load balancers
  'x-client-ip',         // Apache
  'true-client-ip',      // Akamai / Cloudflare Enterprise
] as const;

/**
 * RFC 1918 / RFC 4193 private & loopback ranges.
 * Used to skip internal addresses when parsing X-Forwarded-For chains.
 */
const PRIVATE_IP_PATTERNS = [
  /^127\./,                       // IPv4 loopback
  /^10\./,                        // Class A private
  /^172\.(1[6-9]|2\d|3[01])\./,  // Class B private
  /^192\.168\./,                  // Class C private
  /^::1$/,                        // IPv6 loopback
  /^fe80:/i,                      // IPv6 link-local
  /^fc00:/i,                      // IPv6 unique local
  /^fd/i,                         // IPv6 unique local
] as const;

/**
 * Check if an IP address belongs to a private/loopback range.
 */
function isPrivateIp(ip: string): boolean {
  return PRIVATE_IP_PATTERNS.some((pattern) => pattern.test(ip));
}

/**
 * Strip IPv6-mapped IPv4 prefix (e.g., "::ffff:192.168.1.1" → "192.168.1.1").
 */
function normalizeIp(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('::ffff:')) {
    return trimmed.slice(7);
  }
  return trimmed;
}

/**
 * Extract the real client IP from the request, handling proxies and load balancers.
 *
 * Resolution order:
 *  1. Check trusted proxy headers for a public IP.
 *  2. Fall back to `req.ip` (Express trust proxy setting).
 *  3. Fall back to `req.socket.remoteAddress`.
 *  4. Return "unknown" as a last resort (never null).
 *
 * @param req - Express Request object.
 * @returns The resolved client IP address.
 */
export function extractClientIp(req: Request): string {
  // 1. Check proxy headers
  for (const header of PROXY_HEADERS) {
    const value = req.headers[header];
    if (!value) continue;

    const headerStr = Array.isArray(value) ? value[0] : value;
    if (!headerStr) continue;

    // X-Forwarded-For may contain a comma-separated chain: client, proxy1, proxy2
    const ips = headerStr.split(',').map((ip) => normalizeIp(ip));

    // Pick the first public IP (leftmost = original client)
    const publicIp = ips.find((ip) => ip.length > 0 && !isPrivateIp(ip));
    if (publicIp) return publicIp;

    // If all are private, use the first one
    const firstIp = ips[0];
    if (firstIp && firstIp.length > 0) return firstIp;
  }

  // 2. Express req.ip
  if (req.ip) {
    return normalizeIp(req.ip);
  }

  // 3. Raw socket
  const remote = req.socket?.remoteAddress;
  if (remote) {
    return normalizeIp(remote);
  }

  // 4. Absolute fallback
  return 'unknown';
}
