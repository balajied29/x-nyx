import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { registerRouter } from "./routes/register.js";
import { adminRouter } from "./routes/admin.js";
import { clearSession, isAuthed, issueSession, loginThrottle, passwordMatches, requirePage } from "./auth.js";

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "16kb" }));
  app.use(express.urlencoded({ extended: false, limit: "16kb" }));

  app.get("/health", (_req, res) => res.json({ ok: true }));

  // Public: the teaser's registration form posts here (via the Next app).
  app.use("/api", registerRouter);

  // Dashboard shell — assets carry no data, so they stay unauthenticated.
  app.use("/dashboard/assets", express.static(path.join(publicDir, "assets"), { maxAge: "1h" }));

  app.get("/dashboard/login", (req, res) => {
    if (isAuthed(req)) return res.redirect("/dashboard");
    res.sendFile(path.join(publicDir, "login.html"));
  });

  app.post("/dashboard/login", loginThrottle, (req, res) => {
    const ok = passwordMatches(req.body?.password);
    req.onLoginResult?.(ok);
    if (!ok) return res.redirect("/dashboard/login?error=1");
    issueSession(res);
    res.redirect("/dashboard");
  });

  app.post("/dashboard/logout", (req, res) => {
    clearSession(res);
    res.redirect("/dashboard/login");
  });

  app.get("/dashboard", requirePage, (_req, res) => {
    res.sendFile(path.join(publicDir, "dashboard.html"));
  });

  // Authenticated data endpoints the dashboard reads.
  app.use("/api/admin", adminRouter);

  app.get("/", (_req, res) => res.redirect("/dashboard"));

  app.use((req, res) => res.status(404).json({ ok: false, error: `No route for ${req.method} ${req.path}` }));

  app.use((err, _req, res, _next) => {
    console.error("[server] unhandled:", err);
    res.status(500).json({ ok: false, error: "Server error" });
  });

  return app;
}
