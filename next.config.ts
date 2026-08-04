import type { NextConfig } from "next";

// The Express + MongoDB service (see ./server) owns registrations and the dashboard.
// On Vercel it is a second project with Root Directory `server` — set API_ORIGIN
// on this project to that deployment's URL (no trailing slash).
const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:4000";

if (process.env.VERCEL && !process.env.API_ORIGIN) {
  console.warn(
    "[next.config] API_ORIGIN is not set — /dashboard and registrations will point at localhost and fail. " +
      "Set it in the Vercel project's environment variables and redeploy.",
  );
}

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
