/**
 * Dev helper: logs into the dashboard and captures it for visual checks.
 *   node --env-file=.env scripts/screenshot-dashboard.mjs [outDir] [baseUrl] [password]
 */
import puppeteer from "puppeteer-core";

const OUT = process.argv[2] ?? ".";
const BASE = process.argv[3] ?? "http://localhost:4000";
const PASSWORD = process.argv[4] ?? process.env.DASHBOARD_PASSWORD;

if (!PASSWORD) {
  console.error("Pass the dashboard password as argv[4], or run with --env-file=.env");
  process.exit(1);
}

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
  args: ["--disable-gpu-sandbox", "--hide-scrollbars"],
});

const errors = [];
const page = await browser.newPage();
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));

await page.setViewport({ width: 1440, height: 1000 });
await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle0" });
await page.screenshot({ path: `${OUT}/d_login.png` });

await page.type("#password", PASSWORD);
await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.click("button[type=submit]")]);
await page.waitForSelector(".chart .bar", { timeout: 10000 });
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: `${OUT}/d_dashboard.png`, fullPage: true });

// Hover the most recent day so the tooltip is in the shot.
const bars = await page.$$(".chart .hit");
if (bars.length) {
  await bars[bars.length - 1].hover();
  await new Promise((r) => setTimeout(r, 250));
  await page.screenshot({ path: `${OUT}/d_tooltip.png` });
}

await page.setViewport({ width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 });
await page.reload({ waitUntil: "networkidle0" });
await page.waitForSelector(".chart .bar", { timeout: 10000 });
await page.screenshot({ path: `${OUT}/d_mobile.png`, fullPage: true });

console.log(errors.length ? `console errors:\n${errors.join("\n")}` : "no console errors");
await browser.close();
