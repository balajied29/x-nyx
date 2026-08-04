import mongoose from "mongoose";
import { config } from "./config.js";

mongoose.set("strictQuery", true);

/** Long-running process (npm start): connect once at boot and log loudly. */
export async function connect() {
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 8000 });
  const { host, name } = mongoose.connection;
  console.log(`[db] connected to ${host}/${name}`);

  mongoose.connection.on("disconnected", () => console.warn("[db] disconnected"));
  mongoose.connection.on("error", (err) => console.error("[db] error:", err.message));
}

/**
 * Serverless (Vercel): a warm function reuses its container, so cache the
 * connection on globalThis and hand every invocation the same promise —
 * otherwise each request opens a new pool and Atlas runs out of connections.
 */
const cache = (globalThis.__xnyxMongoose ??= { conn: null, promise: null });

export async function connectCached() {
  if (cache.conn) return cache.conn;
  if (!cache.promise) {
    cache.promise = mongoose
      .connect(config.mongoUri, {
        // Shorter than the local timeout: a serverless invocation has ~10s
        // total, so fail fast enough to return a real error.
        serverSelectionTimeoutMS: 5000,
        maxPoolSize: 5,
        maxIdleTimeMS: 30000,
      })
      .catch((err) => {
        cache.promise = null; // let the next invocation retry instead of caching the failure
        throw err;
      });
  }
  cache.conn = await cache.promise;
  return cache.conn;
}

export async function disconnect() {
  await mongoose.connection.close();
}
