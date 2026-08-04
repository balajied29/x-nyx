import "dotenv/config";

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (!value) {
    // Thrown, not exited: on Vercel this surfaces in the function log instead
    // of killing the runtime silently.
    throw new Error(
      `[config] missing ${name} — set it in .env locally, or in the Vercel project's environment variables`,
    );
  }
  return value;
}

export const config = {
  mongoUri: required("MONGODB_URI", "mongodb://127.0.0.1:27017/xnyx"),
  port: Number(process.env.PORT ?? 4000),
  dashboardPassword: required("DASHBOARD_PASSWORD"),
  sessionSecret: required("SESSION_SECRET"),
  timezone: process.env.TZ_NAME ?? "Asia/Kolkata",
  // Visitor numbers are a real running count; this offsets where it starts.
  visitorBase: Number(process.env.VISITOR_BASE ?? 0),
  isProd: process.env.NODE_ENV === "production",
};
