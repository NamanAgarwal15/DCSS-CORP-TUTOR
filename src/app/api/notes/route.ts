import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireGroupAccess } from "@/lib/auth";
import { badJson, MAX, readJson, str, studentNameOf, unauthorized } from "@/lib/http";

export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    if (!body) return badJson();
    const groupId = str(body, "groupId");
    const content = str(body, "content");
    const studentName = studentNameOf(body);

    if (!groupId || !content) {
      return NextResponse.json({ error: "groupId and content are required" }, { status: 400 });
    }
    if (!(await requireGroupAccess(groupId))) return unauthorized();
    if (content.length > MAX.note) {
      return NextResponse.json(
        { error: `Note must be at most ${MAX.note} characters` },
        { status: 400 }
      );
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
        studentName,
      },
    });

    return NextResponse.json({ id: entry.id, type: entry.type });
  } catch (err) {
    console.error("POST /api/notes failed:", err);
    return NextResponse.json({ error: "Failed to save note" }, { status: 500 });
  }
}
