import type { NextConfig } from "next";

// The Express + MongoDB service (see ./server) owns registrations and the dashboard.
const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  // Serve the dashboard under the teaser's own origin at /dashboard.
  rewrites() {
    return [
      { source: "/dashboard", destination: `${API_ORIGIN}/dashboard` },
      { source: "/dashboard/:path*", destination: `${API_ORIGIN}/dashboard/:path*` },
      { source: "/api/admin/:path*", destination: `${API_ORIGIN}/api/admin/:path*` },
    ];
  },
};

export default nextConfig;
