/**
 * Records the reveal as a 9:16 clip for socials.
 *
 *   node scripts/record-reveal.mjs                 # vertical, 1080x1920
 *   FORMAT=16x9 node scripts/record-reveal.mjs     # horizontal, 1920x1080
 *   BASE=http://localhost:3001 node scripts/record-reveal.mjs
 *
 * Needs the dev (or start) server running, and ffmpeg on PATH. Drives
 * ?preview=reveal, so it does not wait for the real countdown to end.
 *
 * The camera is scripted here rather than left to the page. Two things in the
 * app fight a recording: the reveal fires 2.6s in, which is barely time to read
 * the countdown, and the page then scrolls itself to the lineup — a jump that
 * lands mid-section. Both are neutralised below so the move is ours.
 *
 * It holds on the clock, flashes, lets the new line breathe, rises to the
 * title card, then stops on each night in turn rather than crawling past all
 * of them — see the camera block for why that is both better to watch and far
 * kinder to a capture that cannot hold a constant frame rate.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import puppeteer from "puppeteer-core";

const OUT = process.env.OUT ?? process.cwd();
const BASE = process.env.BASE ?? "http://localhost:3000";
const CHROME =
  process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

/**
 * Both cuts come from the same run; only the frame differs. The CSS size is
 * what the page lays out at — 360 wide lands in the phone breakpoints, 1280
 * gets the desktop layout — and the scale factor raster it up to the delivery
 * size rather than upscaling a small capture afterwards.
 */
const FORMATS = {
  "9x16": { css: [360, 640], dsf: 3, out: [1080, 1920], mobile: true },
  "16x9": { css: [1280, 720], dsf: 1.5, out: [1920, 1080], mobile: false },
};
const FORMAT = process.env.FORMAT ?? "9x16";
/* 30, not 60. The scene re-renders a full-screen WebGL canvas with bloom on
   every scrolled frame and cannot hold 60 — asking for it only guarantees that
   a third of the frames are repeats of the one before. */
const FPS = Number(process.env.FPS ?? 30);
const fmt = FORMATS[FORMAT];
if (!fmt) throw new Error(`FORMAT must be one of ${Object.keys(FORMATS).join(", ")}`);
const [cssW, cssH] = fmt.css;
const [outW, outH] = fmt.out;
const FILE = `${OUT}/nyx-reveal-${FORMAT}`;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// How long the countdown stays on screen before the flash. The page ships 2.6s.
const CLOCK_HOLD_MS = Number(process.env.CLOCK_HOLD_MS ?? 5000);

const b = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--enable-gpu", "--use-gl=angle", "--enable-unsafe-swiftshader", "--no-sandbox",
         "--hide-scrollbars", "--force-color-profile=srgb",
         `--force-device-scale-factor=${fmt.dsf}`],
});
const p = await b.newPage();
await p.setViewport({
  width: cssW, height: cssH, deviceScaleFactor: fmt.dsf,
  isMobile: fmt.mobile, hasTouch: fmt.mobile,
});
const cdp = await p.createCDPSession();
await cdp.send("Emulation.setEmulatedMedia", {
  features: [{ name: "prefers-reduced-motion", value: "no-preference" }],
});

await p.evaluateOnNewDocument((clockHold) => {
  // The dev-server badge must not end up in a social cut.
  const css = document.createElement("style");
  css.textContent = "nextjs-portal,[data-nextjs-toast],#__next-build-watcher{display:none!important}" +
    "html{scroll-behavior:auto!important}";
  document.addEventListener("DOMContentLoaded", () => document.head.appendChild(css));

  // Hold the clock longer than the page would. 2600 is the reveal timer in
  // app/page.tsx; every other timeout it sets is left alone.
  const realTimeout = window.setTimeout;
  window.setTimeout = function (fn, delay, ...rest) {
    return realTimeout.call(this, fn, delay === 2600 ? clockHold : delay, ...rest);
  };

  // The page scrolls itself to the lineup after the flash. This script owns the
  // camera instead, so that jump is dropped.
  Element.prototype.scrollIntoView = function () {};
}, CLOCK_HOLD_MS);

// Warm the cache so the take is not waiting on images.
await p.goto(`${BASE}/?preview=revealed`, { waitUntil: "networkidle0", timeout: 60000 });
await wait(1200);

/**
 * Frame capture straight off CDP.
 *
 * puppeteer's own page.screencast() pipes PNG frames into ffmpeg, and encoding
 * a 1080p PNG per frame is enough CPU that the capture drops well under the
 * requested rate whenever the machine is busy — the recording silently comes
 * out juddery rather than failing. JPEG frames cost a fraction of that, so the
 * capture keeps up. Each frame's real timestamp is kept and turned into a
 * concat list afterwards, so the output holds true timing instead of assuming
 * every frame arrived on schedule.
 */
async function startCapture() {
  const dir = `${FILE}-frames`;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const times = [];
  let n = 0;

  cdp.on("Page.screencastFrame", async ({ data, sessionId, metadata }) => {
    const file = `${dir}/f${String(n++).padStart(5, "0")}.jpg`;
    writeFileSync(file, Buffer.from(data, "base64"));
    times.push(metadata.timestamp);

    try {
      await cdp.send("Page.screencastFrameAck", { sessionId });
    } catch {
      /* recording already stopped */
    }
  });

  await cdp.send("Page.startScreencast", {
    format: "jpeg",
    quality: 92,
    maxWidth: outW,
    maxHeight: outH,
    everyNthFrame: 1,
  });

  return {
    async stop() {
      await cdp.send("Page.stopScreencast");
      await wait(300);
      // Real durations between frames, so a hitch stays a hitch rather than
      // shifting everything after it.
      const lines = [];
      for (let i = 0; i < n; i++) {
        const next = times[i + 1] ?? times[i] + 1 / FPS;
        lines.push(`file '${dir}/f${String(i).padStart(5, "0")}.jpg'`);
        lines.push(`duration ${Math.max(1 / 240, next - times[i]).toFixed(6)}`);
      }
      lines.push(`file '${dir}/f${String(n - 1).padStart(5, "0")}.jpg'`);
      writeFileSync(`${FILE}-frames.txt`, lines.join("\n"));
      return { dir, count: n };
    },
  };
}

// The take. Screencast measures the page's native pixel dimensions when it
// starts, so it has to start on the real page — and starting it mid-navigation
// destroys the context it measures from. DOMContentLoaded is comfortably
// inside the reveal timer, which does not start until React mounts.
await p.goto(`${BASE}/?preview=reveal`, { waitUntil: "domcontentloaded", timeout: 60000 });
const rec = await startCapture();

// loader ~1.4s · countdown holds · flash · the new line lands and breathes
await wait(CLOCK_HOLD_MS + 4400);

const marks = await p.evaluate(() => {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  const centre = (el) => {
    const r = el.getBoundingClientRect();
    return Math.max(0, Math.min(max, Math.round(r.top + window.scrollY - (window.innerHeight - r.height) / 2)));
  };
  return {
    // The stage, not the title: the title is sticky inside it, so its own box
    // reports wherever it is pinned rather than where the run begins.
    head: Math.round(document.querySelector(".headStage").getBoundingClientRect().top + window.scrollY),
    cards: [...document.querySelectorAll(".cards .card")].map(centre),
    bottom: max,
  };
});

/**
 * The camera stops on each night rather than crawling past all of them.
 *
 * A single continuous descent had to be slow enough to read, which made it
 * both monotonous and the worst possible case for a capture that cannot hold a
 * constant frame rate — every unevenness had a long steady move to show up
 * against. Moving in short eased hops and resting on each card puts most of
 * the piece in stillness, where there is no motion to judder, and what
 * movement remains is slow at both ends of every hop, which is exactly where
 * irregularity is least visible. It also reads as deliberate rather than as a
 * page being scrolled past a camera.
 */
const HOP = 1.15, REST = 1.25;
const segments = [{ from: 0, to: marks.head, dur: 2.6 },
                  { from: marks.head, to: marks.head, dur: 1.6, hold: true }];
let at = marks.head;
const stops = [...marks.cards, marks.bottom];
stops.forEach((to, i) => {
  const last = i === stops.length - 1;
  segments.push({ from: at, to, dur: last ? 1.3 : HOP });
  segments.push({ from: to, to, dur: last ? 2.8 : REST, hold: true });
  at = to;
});
const RUN = segments.reduce((n, seg) => n + seg.dur, 0);
console.log(`  ${marks.cards.length} nights · camera runs ${RUN.toFixed(1)}s`);

await p.evaluate((cam) => {
  const t0 = performance.now();
  const smooth = (q) => q * q * q * (q * (q * 6 - 15) + 10);
  const glide = smooth;
  const tick = () => {
    let t = (performance.now() - t0) / 1000;
    let y = cam.segments[0].from;
    for (const seg of cam.segments) {
      if (t < seg.dur) {
        y = seg.hold ? seg.from : seg.from + (seg.to - seg.from) * glide(t / seg.dur);
        break;
      }
      t -= seg.dur;
      y = seg.to;
    }
    window.scrollTo(0, y);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}, { segments });

await wait(RUN * 1000 + 500);

const shot = await rec.stop();
await b.close();
console.log(`captured ${shot.count} frames`);

// ---------------------------------------------------------------- the edit
//
// A flat transcode of the capture plays like a screen recording. Three things
// turn it into a cut: the flash runs at half speed so the moment lands rather
// than flicking past, the piece opens out of black, and it falls back to black
// at the end instead of stopping dead on the last frame.

const sh = (args) => execFileSync("ffmpeg", ["-y", "-v", "error", ...args], { stdio: "inherit" });
const probe = (f, entries) =>
  execFileSync("ffprobe", ["-v", "error", "-show_entries", entries, "-of", "default=nw=1:nk=1", f])
    .toString().trim();

// Normalise the screencast first: the webm it writes carries no duration and
// a variable frame rate, neither of which the trim/concat below can work with.
const base = `${FILE}-base.mp4`;
sh(["-f", "concat", "-safe", "0", "-i", `${FILE}-frames.txt`,
    /* A shutter. The capture runs at about three times the delivery rate, so
       three source frames average into each frame kept — roughly a 33ms
       exposure at 30fps, which is what a camera would give a move this fast.
       It costs nothing where it is not wanted: a rest holds the same frame, and
       averaging identical frames returns that frame, so every card the piece
       stops on stays exactly as sharp as it was. Only the hops carry blur, and
       a fast hop without it strobes. */
    "-vf", `tmix=frames=3:weights=1 1 1,scale=${outW}:${outH}:flags=lanczos,format=yuv420p`,
    "-fps_mode", "cfr", "-r", `${FPS}`,
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "16", "-an", base]);
const duration = parseFloat(probe(base, "format=duration"));

// Find the flash rather than assuming where it is: it is far and away the
// brightest thing in the piece, so the peak average luma is the frame.
const stats = execFileSync("ffmpeg", ["-v", "error", "-i", base,
  "-vf", "scale=64:114,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-",
  "-f", "null", "-"]).toString();
let peakT = 0, peakY = -1, t = 0;
for (const line of stats.split("\n")) {
  const pts = line.match(/pts_time:([\d.]+)/);
  if (pts) t = parseFloat(pts[1]);
  const y = line.match(/YAVG=([\d.]+)/);
  if (y && parseFloat(y[1]) > peakY) { peakY = parseFloat(y[1]); peakT = t; }
}

// Ramp from just before the peak through the fade back to black.
const SLOW = 0.5;                                   // half speed across the beat
const inT = Math.max(0, peakT - 0.5);
const outT = Math.min(duration, peakT + 1.6);
const total = inT + (outT - inT) / SLOW + (duration - outT);
console.log(`flash at ${peakT.toFixed(2)}s (luma ${peakY.toFixed(0)}) — ramping ${inT.toFixed(2)}–${outT.toFixed(2)}s`);

sh(["-i", base, "-filter_complex",
  `[0:v]trim=0:${inT},setpts=PTS-STARTPTS[a];` +
  `[0:v]trim=${inT}:${outT},setpts=(PTS-STARTPTS)/${SLOW}[b];` +
  `[0:v]trim=${outT},setpts=PTS-STARTPTS[c];` +
  `[a][b][c]concat=n=3:v=1:a=0[j];` +
  `[j]fade=t=in:st=0:d=1,fade=t=out:st=${(total - 1.6).toFixed(2)}:d=1.6,` +
  `format=yuv420p[v]`,
  "-map", "[v]", "-r", `${FPS}`, "-c:v", "libx264", "-profile:v", "high", "-level", "4.2",
  "-preset", "slow", "-crf", "19", "-movflags", "+faststart", "-an",
  `${FILE}.mp4`]);

// How much of the output is genuinely new frames rather than the encoder
// holding the last one. A high figure across the whole piece is not the goal —
// the held beats repeat frames because nothing is moving, which is correct.
// What matters is that the moving sections are carrying real frames.
const dec = spawnSync("ffmpeg", ["-v", "info", "-i", `${FILE}.mp4`,
  "-vf", "mpdecimate", "-fps_mode", "vfr", "-f", "null", "-"], { encoding: "utf8" });
// ffmpeg prints a progress line per chunk; the last one is the total.
const progress = dec.stderr.match(/frame=\s*\d+/g) ?? [];
const kept = Number((progress.at(-1) ?? "0").replace(/\D/g, ""));
const frames = Number(probe(`${FILE}.mp4`, "stream=nb_frames").split("\n")[0]);
console.log(`wrote ${FILE}.mp4  ${outW}x${outH} @${FPS}fps  (${total.toFixed(1)}s)`);
console.log(`  ${kept}/${frames} frames distinct — the rest are the held beats`);
rmSync(`${FILE}-frames`, { recursive: true, force: true });
rmSync(`${FILE}-frames.txt`, { force: true });
