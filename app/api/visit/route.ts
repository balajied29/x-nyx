import { NextResponse } from "next/server";

// The visitor counter lives with the registrations service in ./server.
const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:4000";

export async function POST() {
  try {
    const res = await fetch(`${API_ORIGIN}/api/visit`, { method: "POST" });
    const data = await res.json().catch(() => ({ ok: false }));
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("[visit] counter unreachable:", err);
    return NextResponse.json({ ok: false }, { status: 502 });
  }
}
