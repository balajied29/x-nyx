import { createApp } from "./app.js";
import { config } from "./config.js";
import { connect, disconnect } from "./db.js";

const app = createApp();

try {
  await connect();
} catch (err) {
  console.error(`[db] could not reach MongoDB at ${config.mongoUri.replace(/\/\/[^@]*@/, "//***@")}`);
  console.error(`[db] ${err.message}`);
  process.exit(1);
}

const server = app.listen(config.port, () => {
  console.log(`[server] dashboard → http://localhost:${config.port}/dashboard`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    server.close();
    await disconnect();
    process.exit(0);
  });
}
