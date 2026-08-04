/**
 * Vercel entrypoint. Vercel runs the app as a serverless function, so nothing
 * listens on a port here — we hand each request to the same Express app that
 * `npm start` runs locally, after making sure Mongo is connected.
 *
 * vercel.json routes every path to this file, so Express still owns routing.
 */
import { createApp } from "../src/app.js";
import { connectCached } from "../src/db.js";

const app = createApp();

export default async function handler(req, res) {
  try {
    await connectCached();
  } catch (err) {
    console.error("[db] connection failed:", err.message);
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ ok: false, error: "Database unavailable" }));
  }
  return app(req, res);
}
