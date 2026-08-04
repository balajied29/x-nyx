import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

const FILE = path.join(process.cwd(), "data", "registrations.json");

type Registration = { name: string; email: string; phone: string; at: string };

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  const email = String(body?.email ?? "").trim().toLowerCase();
  const phone = String(body?.phone ?? "").trim();

  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: "Enter a valid name and email" }, { status: 400 });
  }
  if ((phone.match(/\d/g) ?? []).length < 7) {
    return NextResponse.json({ ok: false, error: "Enter a valid phone number" }, { status: 400 });
  }

  await fs.mkdir(path.dirname(FILE), { recursive: true });
  let list: Registration[] = [];
  try {
    list = JSON.parse(await fs.readFile(FILE, "utf8"));
  } catch {
    // first registration — file doesn't exist yet
  }

  if (!list.some((r) => r.email === email)) {
    list.push({ name, email, phone, at: new Date().toISOString() });
    await fs.writeFile(FILE, JSON.stringify(list, null, 2));
  }

  return NextResponse.json({ ok: true });
}
