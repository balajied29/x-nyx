/**
 * Dev helper: fills the dashboard with fake signups so you can see it working.
 *   npm run seed        -> 24 fake registrations spread over the last 3 weeks
 *   npm run seed -- 100 -> 100 of them
 * Every seeded row uses an @seed.local email so `npm run seed -- --clear` can remove them.
 */
import mongoose from "mongoose";
import { config } from "../src/config.js";
import { connect, disconnect } from "../src/db.js";
import { Registration } from "../src/models/Registration.js";

if (config.isProd) {
  console.error("[seed] refusing to run with NODE_ENV=production");
  process.exit(1);
}

const args = process.argv.slice(2);
const clear = args.includes("--clear");
const count = Number(args.find((a) => /^\d+$/.test(a))) || 24;

const FIRST = ["Aarav", "Ananya", "Rohan", "Ishita", "Kabir", "Meera", "Dev", "Nikita", "Arjun", "Tara", "Vikram", "Sara"];
const LAST = ["Sharma", "Nair", "Iyer", "Kapoor", "Bose", "Reddy", "Menon", "Chettri", "Lyngdoh", "Sungoh"];

await connect();

if (clear) {
  const { deletedCount } = await Registration.deleteMany({ email: /@seed\.local$/ });
  console.log(`[seed] removed ${deletedCount} seeded rows`);
  await disconnect();
  process.exit(0);
}

const docs = Array.from({ length: count }, (_, i) => {
  const first = FIRST[Math.floor(Math.random() * FIRST.length)];
  const last = LAST[Math.floor(Math.random() * LAST.length)];
  // Weight recent days more heavily so the chart has a visible ramp.
  const daysAgo = Math.floor(Math.pow(Math.random(), 1.8) * 21);
  const at = new Date(Date.now() - daysAgo * 86400000 - Math.random() * 86400000);
  return {
    name: `${first} ${last}`,
    email: `${first}.${last}.${i}`.toLowerCase() + "@seed.local",
    phone: `+91 9${Math.floor(100000000 + Math.random() * 899999999)}`,
    source: "seed",
    createdAt: at,
    updatedAt: at,
  };
});

await Registration.insertMany(docs, { ordered: false }).catch((err) => {
  if (err.code !== 11000) throw err;
});

console.log(`[seed] inserted ${docs.length} fake registrations into ${mongoose.connection.name}`);
await disconnect();
