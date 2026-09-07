import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getGeminiModel, extractJson, validateReflection } from "@/lib/gemini";

const PROMPT = (studentPrompt: string) => `You are an AI Agent Tutor for university students in an entrepreneurship course, helping a student group reflect on their startup project progress.

The student group's reflection request:
"""
${studentPrompt}
"""

Based on their request, produce a class reflection:
- keyPoints: 3 to 5 concise key points summarizing the group's progress, insights, or challenges.
- openQuestion: one thought-provoking open question to push the group's thinking further.

Respond with ONLY a JSON object matching exactly this shape, with no markdown, no code fences, and no commentary:
{"keyPoints": ["...", "..."], "openQuestion": "..."}`;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const groupId = typeof body?.groupId === "string" ? body.groupId : "";
    const studentPrompt =
      typeof body?.studentPrompt === "string" ? body.studentPrompt.trim() : "";

    if (!groupId || !studentPrompt) {
      return NextResponse.json(
        { error: "groupId and studentPrompt are required" },
        { status: 400 }
      );
    }

    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    // Log the student's prompt first, linked to the entry once it exists.
    const model = getGeminiModel();
    const result = await model.generateContent(PROMPT(studentPrompt));
    const raw = result.response.text();
    console.log("[reflection] raw model response:", raw);

    let parsed: unknown;
    try {
      parsed = JSON.parse(extractJson(raw));
    } catch (parseErr) {
      console.error("[reflection] failed to parse model response:", raw, parseErr);
      return NextResponse.json(
        {
          error:
            "The AI response could not be parsed as valid JSON. Nothing was saved — please try again.",
        },
        { status: 502 }
      );
    }

    let reflection;
    try {
      reflection = validateReflection(parsed);
    } catch (validationErr) {
      console.error(
        "[reflection] response did not match expected shape:",
        JSON.stringify(parsed),
        validationErr
      );
      return NextResponse.json(
        {
          error:
            "The AI response did not match the expected reflection format. Nothing was saved — please try again.",
        },
        { status: 502 }
      );
    }

    // Parse + validation succeeded — now persist atomically.
    const entry = await prisma.entry.create({
      data: {
        groupId,
        type: "REFLECTION",
        content: JSON.stringify(reflection),
      },
    });
    await prisma.promptLog.createMany({
      data: [
        { groupId, entryId: entry.id, role: "STUDENT", content: studentPrompt },
        { groupId, entryId: entry.id, role: "AI", content: raw },
      ],
    });

    return NextResponse.json({ entryId: entry.id, reflection });
  } catch (err) {
    console.error("POST /api/reflection failed:", err);
    return NextResponse.json({ error: "Reflection failed" }, { status: 500 });
  }
}
