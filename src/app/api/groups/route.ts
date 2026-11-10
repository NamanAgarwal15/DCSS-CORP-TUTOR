import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";
import { groupCookie, hashSecret, requireFaculty } from "@/lib/auth";
import { badJson, MAX, MIN_PASSCODE, readJson, str, unauthorized } from "@/lib/http";

function generateSlug(): string {
  return randomBytes(5).toString("hex"); // 10-char shareable code
}

export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    if (!body) return badJson();
    const name = str(body, "name");
    // Passcodes are taken exactly as typed (not trimmed).
    const passcode = typeof body.passcode === "string" ? body.passcode : "";

    if (!name) {
      return NextResponse.json({ error: "Group name is required" }, { status: 400 });
    }
    if (name.length > MAX.groupName) {
      return NextResponse.json(
        { error: `Group name must be at most ${MAX.groupName} characters` },
        { status: 400 }
      );
    }
    if (passcode.length < MIN_PASSCODE || passcode.length > MAX.passcode) {
      return NextResponse.json(
        { error: `Passcode must be between ${MIN_PASSCODE} and ${MAX.passcode} characters` },
        { status: 400 }
      );
    }

    const group = await prisma.group.create({
      data: { name, slug: generateSlug(), passcodeHash: hashSecret(passcode) },
    });

    // The creator is let straight in.
    const res = NextResponse.json({ id: group.id, name: group.name, slug: group.slug });
    const c = groupCookie(group.id);
    res.cookies.set(c.name, c.value, c.options);
    return res;
  } catch (err) {
    console.error("POST /api/groups failed:", err);
    return NextResponse.json({ error: "Failed to create group" }, { status: 500 });
  }
}

export async function GET() {
  if (!(await requireFaculty())) return unauthorized();
  try {
    const groups = await prisma.group.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true, _count: { select: { entries: true } } },
    });
    return NextResponse.json({ groups });
  } catch (err) {
    console.error("GET /api/groups failed:", err);
    return NextResponse.json({ error: "Failed to list groups" }, { status: 500 });
  }
}
