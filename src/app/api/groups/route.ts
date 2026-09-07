import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";

function generateSlug(): string {
  return randomBytes(5).toString("hex"); // 10-char shareable code
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "Group name is required" }, { status: 400 });
    }

    const group = await prisma.group.create({
      data: { name, slug: generateSlug() },
    });

    return NextResponse.json({ id: group.id, name: group.name, slug: group.slug });
  } catch (err) {
    console.error("POST /api/groups failed:", err);
    return NextResponse.json({ error: "Failed to create group" }, { status: 500 });
  }
}

export async function GET() {
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
