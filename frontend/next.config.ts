import type { NextConfig } from "next";

const backendUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  // Proxy /api/* requests to the backend.
  // This avoids CORS issues during local development and in production
  // (browser only ever talks to the same origin).
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
