import puppeteer from "puppeteer-core";

const OUT = "/private/tmp/claude-501/-Users-balajiedsungoh/12025813-6556-4090-b066-a3aa9f4a05d2/scratchpad";
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
  args: ["--disable-gpu-sandbox", "--hide-scrollbars"],
});

const shots = [
  { name: "p_desktop", w: 1440, h: 900, url: "http://localhost:3001", click: null },
  { name: "p_form", w: 1440, h: 900, url: "http://localhost:3001", click: ".cta" },
  { name: "p_mobile", w: 390, h: 844, url: "http://localhost:3001", click: null, mobile: true },
  { name: "p_registered", w: 1440, h: 900, url: "http://localhost:3001/?preview=registered", click: null },
];

for (const s of shots) {
  const page = await browser.newPage();
  await page.setViewport({ width: s.w, height: s.h, isMobile: !!s.mobile, deviceScaleFactor: s.mobile ? 2 : 1 });
  await page.goto(s.url, { waitUntil: "networkidle0", timeout: 30000 });
  await page.waitForSelector(".loader.done", { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 1500)); // let fade + first frames settle
  if (s.click) {
    await page.click(s.click);
    await new Promise((r) => setTimeout(r, 800));
  }
  await page.screenshot({ path: `${OUT}/${s.name}.png` });
  console.log(s.name, "ok");
  await page.close();
}
await browser.close();
