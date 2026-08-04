import { Router } from "express";
import { Registration } from "../models/Registration.js";

export const registerRouter = Router();

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

registerRouter.post("/register", async (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const phone = String(req.body?.phone ?? "").trim();

  if (!name || !EMAIL.test(email)) {
    return res.status(400).json({ ok: false, error: "Enter a valid name and email" });
  }
  if ((phone.match(/\d/g) ?? []).length < 7) {
    return res.status(400).json({ ok: false, error: "Enter a valid phone number" });
  }

  try {
    // Upsert keeps the first registration for an email and ignores repeats.
    const result = await Registration.updateOne(
      { email },
      {
        $setOnInsert: {
          name: name.slice(0, 120),
          email,
          phone: phone.slice(0, 40),
          source: String(req.body?.source ?? "teaser").slice(0, 40),
          userAgent: String(req.headers["user-agent"] ?? "").slice(0, 300),
        },
      },
      { upsert: true },
    );
    return res.json({ ok: true, created: result.upsertedCount === 1 });
  } catch (err) {
    if (err?.code === 11000) return res.json({ ok: true, created: false });
    console.error("[register] failed:", err);
    return res.status(500).json({ ok: false, error: "Something went wrong — try again" });
  }
});
