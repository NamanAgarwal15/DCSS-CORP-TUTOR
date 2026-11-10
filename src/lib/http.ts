import { NextResponse } from "next/server";

/** Parse a JSON request body; returns null if the body is not valid JSON. */
export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export const badJson = () => NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
export const unauthorized = () => NextResponse.json({ error: "Unauthorized" }, { status: 401 });

/** Trimmed string field, or "" if missing / not a string. */
export function str(body: Record<string, unknown>, key: string): string {
  const v = body[key];
  return typeof v === "string" ? v.trim() : "";
}

export const MAX = {
  reflectionField: 4000,
  newsPaste: 8000,
  note: 2000,
  groupName: 100,
  passcode: 200,
  credential: 200,
  studentName: 60,
} as const;

export const MIN_PASSCODE = 6;

/** Optional self-reported student name: trimmed, capped, or null if absent. */
export function studentNameOf(body: Record<string, unknown>): string | null {
  return str(body, "studentName").slice(0, MAX.studentName) || null;
}

// ---- Best-effort in-memory per-IP rate limiter.
// On serverless hosts (Vercel) each instance has its own memory and instances
// are recycled, so this only limits bursts hitting the same instance.

const hits = new Map<string, number[]>();

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0] || req.headers.get("x-real-ip") || "unknown").trim();
}

export function rateLimited(req: Request, bucket: string, limit: number, windowMs: number): NextResponse | null {
  const key = `${bucket}:${clientIp(req)}`;
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return NextResponse.json(
      { error: "Too many requests — please wait a minute and try again." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(windowMs / 1000)) } }
    );
  }
  recent.push(now);
  hits.set(key, recent);
  return null;
}
