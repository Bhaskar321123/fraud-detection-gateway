import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow localtunnel to load JS chunks
  // This is required in Next.js 14+ when using tunnels
  allowedDevOrigins: [
    'light-chicken-give.loca.lt', 
    'metal-buses-boil.loca.lt',
    'localhost:3001'
  ],
  async rewrites() {
    return []
  },
};

export default nextConfig;
