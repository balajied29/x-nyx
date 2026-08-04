import { Router } from "express";
import { nextInSequence } from "../models/Counter.js";
import { config } from "../config.js";

export const visitRouter = Router();

/**
 * Claims the next visitor number. The teaser calls this once per browser and
 * keeps the result in localStorage, so the number a visitor sees never changes.
 */
visitRouter.post("/visit", async (_req, res) => {
  try {
    const seq = await nextInSequence("visitors");
    res.json({ ok: true, number: config.visitorBase + seq });
  } catch (err) {
    console.error("[visit] counter failed:", err);
    res.status(500).json({ ok: false, error: "Could not assign a visitor number" });
  }
});
