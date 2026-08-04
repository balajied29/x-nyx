import "dotenv/config";

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (!value) {
    console.error(`[config] missing ${name} — copy .env.example to .env and fill it in`);
    process.exit(1);
  }
  return value;
}

export const config = {
  mongoUri: required("MONGODB_URI", "mongodb://127.0.0.1:27017/xnyx"),
  port: Number(process.env.PORT ?? 4000),
  dashboardPassword: required("DASHBOARD_PASSWORD"),
  sessionSecret: required("SESSION_SECRET"),
  timezone: process.env.TZ_NAME ?? "Asia/Kolkata",
  isProd: process.env.NODE_ENV === "production",
};
