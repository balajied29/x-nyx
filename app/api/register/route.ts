import { NextResponse } from "next/server";

// Registrations live in MongoDB, behind the Express service in ./server.
const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:4000";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);

  try {
    const res = await fetch(`${API_ORIGIN}/api/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": req.headers.get("user-agent") ?? "",
      },
      body: JSON.stringify({
        name: body?.name ?? "",
        email: body?.email ?? "",
        phone: body?.phone ?? "",
        source: "teaser",
      }),
    });

    const data = await res.json().catch(() => ({ ok: false, error: "Something went wrong — try again" }));
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("[register] registrations API unreachable:", err);
    return NextResponse.json(
      { ok: false, error: "We couldn't save that just now — try again in a moment" },
      { status: 502 },
    );
  }
}
