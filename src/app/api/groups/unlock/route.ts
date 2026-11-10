import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { groupCookie, verifySecret } from "@/lib/auth";
import { badJson, MAX, rateLimited, readJson, str } from "@/lib/http";

/** POST { slug, passcode } → sets the group's signed cookie on success. */
export async function POST(req: Request) {
  // Slow down passcode guessing.
  const limited = rateLimited(req, "unlock", 10, 60_000);
  if (limited) return limited;

  try {
    const body = await readJson(req);
    if (!body) return badJson();
    const slug = str(body, "slug");
    const passcode = typeof body.passcode === "string" ? body.passcode : "";
    if (!slug || !passcode || passcode.length > MAX.passcode) {
      return NextResponse.json({ error: "slug and passcode are required" }, { status: 400 });
    }

    const group = await prisma.group.findUnique({ where: { slug } });
    // Same response for unknown group and wrong passcode.
    if (!group || !verifySecret(passcode, group.passcodeHash)) {
      return NextResponse.json({ error: "Wrong passcode" }, { status: 401 });
    }

    const res = NextResponse.json({ ok: true });
    const c = groupCookie(group.id);
    res.cookies.set(c.name, c.value, c.options);
    return res;
  } catch (err) {
    console.error("POST /api/groups/unlock failed:", err);
    return NextResponse.json({ error: "Unlock failed" }, { status: 500 });
  }
}
