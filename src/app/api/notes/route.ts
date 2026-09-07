import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const groupId = typeof body?.groupId === "string" ? body.groupId : "";
    const content = typeof body?.content === "string" ? body.content.trim() : "";

    if (!groupId || !content) {
      return NextResponse.json({ error: "groupId and content are required" }, { status: 400 });
    }

    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    const entry = await prisma.entry.create({
      data: {
        groupId,
        type: "STUDENT_NOTE",
        content: JSON.stringify({ text: content }),
      },
    });

    return NextResponse.json({ id: entry.id, type: entry.type });
  } catch (err) {
    console.error("POST /api/notes failed:", err);
    return NextResponse.json({ error: "Failed to save note" }, { status: 500 });
  }
}
