import { Router } from "express";
import { Registration } from "../models/Registration.js";
import { config } from "../config.js";
import { requireApi } from "../auth.js";

export const adminRouter = Router();
adminRouter.use(requireApi);

const CHART_DAYS = 30;

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function searchFilter(q) {
  const term = String(q ?? "").trim();
  if (!term) return {};
  const rx = new RegExp(escapeRegex(term), "i");
  return { $or: [{ name: rx }, { email: rx }, { phone: rx }] };
}

/** YYYY-MM-DD for a moment, in the configured timezone. */
function dayKey(date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: config.timezone }).format(date);
}

/** The last n day keys ending today, oldest first. */
function recentDayKeys(n) {
  const today = new Date(`${dayKey(new Date())}T00:00:00Z`);
  const keys = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    keys.push(d.toISOString().slice(0, 10));
  }
  return keys;
}

adminRouter.get("/registrations", async (req, res) => {
  const filter = searchFilter(req.query.q);
  const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 200);
  const page = Math.max(Number(req.query.page) || 1, 1);
  const dir = req.query.dir === "asc" ? 1 : -1;
  const sortField = ["name", "email", "createdAt"].includes(req.query.sort)
    ? req.query.sort
    : "createdAt";

  const [items, total] = await Promise.all([
    Registration.find(filter)
      .sort({ [sortField]: dir })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Registration.countDocuments(filter),
  ]);

  res.json({
    ok: true,
    total,
    page,
    limit,
    pages: Math.max(Math.ceil(total / limit), 1),
    items: items.map((r) => ({
      id: String(r._id),
      name: r.name,
      email: r.email,
      phone: r.phone,
      source: r.source,
      createdAt: r.createdAt,
    })),
  });
});

adminRouter.get("/stats", async (_req, res) => {
  const since = new Date(Date.now() - CHART_DAYS * 24 * 60 * 60 * 1000);

  const [total, buckets, latest] = await Promise.all([
    Registration.countDocuments({}),
    Registration.aggregate([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { date: "$createdAt", format: "%Y-%m-%d", timezone: config.timezone } },
          count: { $sum: 1 },
        },
      },
    ]),
    Registration.findOne({}).sort({ createdAt: -1 }).lean(),
  ]);

  const byDay = new Map(buckets.map((b) => [b._id, b.count]));
  const days = recentDayKeys(CHART_DAYS).map((date) => ({ date, count: byDay.get(date) ?? 0 }));
  const last7 = days.slice(-7).reduce((sum, d) => sum + d.count, 0);

  res.json({
    ok: true,
    total,
    today: days.at(-1)?.count ?? 0,
    last7,
    latestAt: latest?.createdAt ?? null,
    latestName: latest?.name ?? null,
    timezone: config.timezone,
    days,
  });
});

adminRouter.get("/registrations.csv", async (req, res) => {
  const rows = await Registration.find(searchFilter(req.query.q)).sort({ createdAt: -1 }).lean();

  const cell = (value) => {
    const text = value == null ? "" : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  const csv = [
    ["name", "email", "phone", "source", "registered_at"].join(","),
    ...rows.map((r) =>
      [r.name, r.email, r.phone, r.source, new Date(r.createdAt).toISOString()].map(cell).join(","),
    ),
  ].join("\n");

  const stamp = dayKey(new Date());
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="nyx-registrations-${stamp}.csv"`);
  res.send(`﻿${csv}`);
});

adminRouter.delete("/registrations/:id", async (req, res) => {
  const result = await Registration.deleteOne({ _id: req.params.id }).catch(() => null);
  if (!result?.deletedCount) return res.status(404).json({ ok: false, error: "Not found" });
  res.json({ ok: true });
});
