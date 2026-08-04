import crypto from "crypto";
import { config } from "./config.js";

const COOKIE = "xnyx_admin";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function sign(payload) {
  const body = Buffer.from(payload).toString("base64url");
  const mac = crypto.createHmac("sha256", config.sessionSecret).update(body).digest("base64url");
  return `${body}.${mac}`;
}

function verify(token) {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const [body, mac] = token.split(".");
  const expected = crypto.createHmac("sha256", config.sessionSecret).update(body).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  const issuedAt = Number(Buffer.from(body, "base64url").toString("utf8"));
  if (!Number.isFinite(issuedAt) || Date.now() - issuedAt > MAX_AGE_MS) return null;
  return issuedAt;
}

export function passwordMatches(candidate) {
  const a = Buffer.from(String(candidate ?? ""));
  const b = Buffer.from(config.dashboardPassword);
  // Hash both sides so timingSafeEqual never sees mismatched lengths.
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function issueSession(res) {
  res.cookie(COOKIE, sign(String(Date.now())), {
    httpOnly: true,
    sameSite: "lax",
    secure: config.isProd,
    maxAge: MAX_AGE_MS,
    path: "/",
  });
}

export function clearSession(res) {
  res.clearCookie(COOKIE, { path: "/" });
}

function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export function isAuthed(req) {
  return verify(readCookie(req, COOKIE)) !== null;
}

/** Guards HTML pages — bounces to the login screen. */
export function requirePage(req, res, next) {
  if (isAuthed(req)) return next();
  return res.redirect("/dashboard/login");
}

/** Guards admin JSON endpoints — 401 instead of a redirect. */
export function requireApi(req, res, next) {
  if (isAuthed(req)) return next();
  return res.status(401).json({ ok: false, error: "Not signed in" });
}

// Small in-memory throttle so the password isn't brute-forceable.
const attempts = new Map();

export function loginThrottle(req, res, next) {
  const key = req.ip ?? "unknown";
  const now = Date.now();
  const entry = attempts.get(key) ?? { count: 0, until: 0 };
  if (entry.until > now) {
    const secs = Math.ceil((entry.until - now) / 1000);
    return res.status(429).send(`Too many attempts — try again in ${secs}s`);
  }
  req.onLoginResult = (ok) => {
    if (ok) return attempts.delete(key);
    entry.count += 1;
    if (entry.count >= 5) {
      attempts.set(key, { count: 0, until: now + 5 * 60 * 1000 });
    } else {
      attempts.set(key, entry);
    }
  };
  next();
}
