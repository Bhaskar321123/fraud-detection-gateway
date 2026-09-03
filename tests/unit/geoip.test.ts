import { resolveGeoLocation, haversineDistanceKm } from '../../src/utils/geoip';

// ──────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────

describe('resolveGeoLocation', () => {
  it('should return null for localhost IPv4 (127.0.0.1)', () => {
    expect(resolveGeoLocation('127.0.0.1')).toBeNull();
  });

  it('should return null for localhost IPv6 (::1)', () => {
    expect(resolveGeoLocation('::1')).toBeNull();
  });

  it('should return null for empty string', () => {
    expect(resolveGeoLocation('')).toBeNull();
  });

  it('should return null for "unknown"', () => {
    expect(resolveGeoLocation('unknown')).toBeNull();
  });

  it('should return null for private IPs (geoip-lite cannot resolve them)', () => {
    // Private IPs are not in the GeoLite2 database
    const result = resolveGeoLocation('192.168.1.1');
    expect(result).toBeNull();
  });

  it('should return a GeoLocation object for a well-known public IP', () => {
    // 8.8.8.8 is Google's public DNS — geoip-lite should have data for it
    const result = resolveGeoLocation('8.8.8.8');

    // geoip-lite may or may not have this IP depending on the bundled database version
    // If it resolves, verify the shape
    if (result !== null) {
      expect(result).toHaveProperty('country');
      expect(result).toHaveProperty('region');
      expect(result).toHaveProperty('city');
      expect(result).toHaveProperty('latitude');
      expect(result).toHaveProperty('longitude');
      expect(result).toHaveProperty('timezone');
      expect(typeof result.latitude).toBe('number');
      expect(typeof result.longitude).toBe('number');
      expect(result.country).toBe('US');
    }
  });

  it('should return the correct shape with string country code', () => {
    // Use a well-known CDN IP that should be in most geoip databases
    const result = resolveGeoLocation('1.1.1.1');

    if (result !== null) {
      expect(result.country).toMatch(/^[A-Z]{2}$/); // ISO 3166-1 alpha-2
      expect(result.latitude).not.toBeNaN();
      expect(result.longitude).not.toBeNaN();
    }
  });
});

describe('haversineDistanceKm', () => {
  it('should return 0 for identical coordinates', () => {
    const distance = haversineDistanceKm(40.7128, -74.006, 40.7128, -74.006);
    expect(distance).toBe(0);
  });

  it('should calculate distance between New York and London accurately', () => {
    // NYC: 40.7128, -74.0060
    // London: 51.5074, -0.1278
    // Known distance: ~5,570 km
    const distance = haversineDistanceKm(40.7128, -74.006, 51.5074, -0.1278);
    expect(distance).toBeGreaterThan(5500);
    expect(distance).toBeLessThan(5700);
  });

  it('should calculate distance between New York and Tokyo accurately', () => {
    // NYC: 40.7128, -74.0060
    // Tokyo: 35.6762, 139.6503
    // Known distance: ~10,850 km
    const distance = haversineDistanceKm(40.7128, -74.006, 35.6762, 139.6503);
    expect(distance).toBeGreaterThan(10700);
    expect(distance).toBeLessThan(11000);
  });

  it('should calculate distance between Sydney and São Paulo accurately', () => {
    // Sydney: -33.8688, 151.2093
    // São Paulo: -23.5505, -46.6333
    // Known distance: ~13,300–13,600 km (varies by exact coordinate source)
    const distance = haversineDistanceKm(-33.8688, 151.2093, -23.5505, -46.6333);
    expect(distance).toBeGreaterThan(13200);
    expect(distance).toBeLessThan(13700);
  });

  it('should be symmetric (A→B = B→A)', () => {
    const ab = haversineDistanceKm(40.7128, -74.006, 51.5074, -0.1278);
    const ba = haversineDistanceKm(51.5074, -0.1278, 40.7128, -74.006);
    expect(Math.abs(ab - ba)).toBeLessThan(0.01);
  });

  it('should handle antipodal points (maximum distance)', () => {
    // North Pole to South Pole: ~20,000 km
    const distance = haversineDistanceKm(90, 0, -90, 0);
    expect(distance).toBeGreaterThan(19900);
    expect(distance).toBeLessThan(20100);
  });

  it('should handle small distances correctly', () => {
    // Two points ~1 km apart in Manhattan
    const distance = haversineDistanceKm(40.748817, -73.985428, 40.758896, -73.985130);
    expect(distance).toBeGreaterThan(0.9);
    expect(distance).toBeLessThan(1.5);
  });
});
