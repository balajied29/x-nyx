import mongoose from "mongoose";
import { config } from "./config.js";

export async function connect() {
  mongoose.set("strictQuery", true);
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 8000 });
  const { host, name } = mongoose.connection;
  console.log(`[db] connected to ${host}/${name}`);

  mongoose.connection.on("disconnected", () => console.warn("[db] disconnected"));
  mongoose.connection.on("error", (err) => console.error("[db] error:", err.message));
}

export async function disconnect() {
  await mongoose.connection.close();
}
