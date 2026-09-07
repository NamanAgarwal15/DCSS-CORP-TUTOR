import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getGeminiModel,
  GOOGLE_SEARCH_TOOL,
  extractJson,
  validateNewsItems,
  extractGroundingSources,
  type NewsItem,
} from "@/lib/gemini";

// NEWS_MODE: "grounded" = live Google Search grounding; "manual" = student
// pastes news text, Gemini parses it. Defaults to "manual" if unset.
const newsMode = process.env.NEWS_MODE === "grounded" ? "grounded" : "manual";

const GROUNDED_PROMPT = (studentPrompt: string) => `You are an AI Agent Tutor for university students in an entrepreneurship course. Search the web for recent news (from roughly the last two weeks) about corporate-startup collaboration: e.g. corporate venture investments, large companies partnering with or acquiring startups, startup programs run by corporations, LinkedIn posts or company site announcements about such collaborations.

The student group's request:
"""
${studentPrompt}
"""

Return 2 to 4 of the most interesting items. Respond with ONLY a JSON array (no markdown, no code fences, no commentary) where each element matches exactly this shape:
[{"source": "Company / publication name", "summary": "1-2 sentence summary of the news", "whyItMatters": "1-2 sentences on why it matters for corporate-startup collaboration"}]`;

const MANUAL_PROMPT = (pastedText: string) => `You are an AI Agent Tutor for university students in an entrepreneurship course. A student has pasted raw news content (e.g. LinkedIn posts, announcement text, links with descriptions) about corporate-startup collaboration. Parse and summarize EXACTLY what they pasted — do not search the web, do not add outside information, and do not invent any source or URL that is not clearly present in the pasted text.

The pasted content:
"""
${pastedText}
"""

Respond with ONLY a JSON array (no markdown, no code fences, no commentary) where each element matches exactly this shape:
[{"source": "Company / publication name found in the pasted text, or exactly "Pasted by student" if no clear source or link is present", "url": "OPTIONAL — a URL copied EXACTLY, character for character, from the pasted text; omit this field entirely if the pasted text contains no URL", "summary": "1-2 sentence summary of the news item", "whyItMatters": "1-2 sentences on why it matters for corporate-startup collaboration"}]`;

type NewsSuccess = { raw: string; structured: Record<string, unknown> };
type NewsFailure = { error: string; status: number };

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ");
}

/** Match each item's declared source to a real grounding-chunk URL. */
function attachUrls(items: NewsItem[], chunks: { uri: string; title: string }[]): NewsItem[] {
  return items.map((item) => {
    if (item.url) return item;
    const src = normalize(item.source);
    const srcTokens = src.split(/\s+/).filter((t) => t.length > 2);
    const match = chunks.find((c) => {
      const hay = normalize(`${c.title} ${c.uri}`);
      return srcTokens.some((t) => hay.includes(t));
    });
    return match ? { ...item, url: match.uri } : item;
  });
}

/**
 * Grounded mode (unchanged from the original implementation): live Google
 * Search grounding is required — no fallback to un-grounded generation.
 */
async function getGroundedNews(studentPrompt: string): Promise<NewsSuccess | NewsFailure> {
  const model = getGeminiModel(GOOGLE_SEARCH_TOOL);
  let raw: string;
  let groundingSources: { uri: string; title: string }[] = [];
  try {
    const result = await model.generateContent(GROUNDED_PROMPT(studentPrompt));
    raw = result.response.text();
    groundingSources = extractGroundingSources(result.response);
    if (groundingSources.length === 0) {
      console.error("[news-update] no groundingMetadata in response");
      return {
        error:
          "The AI response did not include Google Search grounding data. Nothing was saved — please try again.",
        status: 502,
      };
    }
  } catch (aiErr: any) {
    console.error("[news-update] grounded Gemini call failed:", aiErr?.message || aiErr);
    const isQuota = String(aiErr?.message || "").includes("429");
    return {
      error: isQuota
        ? "Gemini API quota exceeded for Google Search grounding (check the API key's plan/billing tier). Nothing was saved."
        : "The grounded news search call failed. Nothing was saved — please try again.",
      status: isQuota ? 429 : 502,
    };
  }

  console.log("[news-update] raw model response:", raw);
  console.log("[news-update] grounding sources:", JSON.stringify(groundingSources, null, 2));

  let items: NewsItem[];
  try {
    items = JSON.parse(extractJson(raw)) as unknown as NewsItem[];
  } catch (parseErr) {
    console.error("[news-update] failed to parse model response:", raw, parseErr);
    return {
      error:
        "The AI response could not be parsed as valid JSON. Nothing was saved — please try again.",
      status: 502,
    };
  }
  try {
    items = validateNewsItems(items);
  } catch (validationErr) {
    console.error(
      "[news-update] response did not match expected shape:",
      JSON.stringify(items),
      validationErr
    );
    return {
      error:
        "The AI response did not match the expected news item format. Nothing was saved — please try again.",
      status: 502,
    };
  }

  items = attachUrls(items, groundingSources);
  return { raw, structured: { items, groundingSources } };
}

/**
 * Manual mode: parse/summarize student-pasted text with no search of any kind.
 * Unsourceable items are honestly labeled "Pasted by student" — never given an
 * invented URL.
 */
async function getManualNews(pastedText: string): Promise<NewsSuccess | NewsFailure> {
  const model = getGeminiModel(); // no grounding tool
  let raw: string;
  try {
    const result = await model.generateContent(MANUAL_PROMPT(pastedText));
    raw = result.response.text();
  } catch (aiErr: any) {
    console.error("[news-update] manual Gemini call failed:", aiErr?.message || aiErr);
    return {
      error: "The AI could not process the pasted content. Nothing was saved — please try again.",
      status: 502,
    };
  }

  console.log("[news-update] raw model response:", raw);

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(raw));
  } catch (parseErr) {
    console.error("[news-update] failed to parse model response:", raw, parseErr);
    return {
      error:
        "The AI response could not be parsed as valid JSON. Nothing was saved — please try again.",
      status: 502,
    };
  }

  let items: NewsItem[];
  try {
    items = validateNewsItems(parsed);
  } catch (validationErr) {
    console.error(
      "[news-update] response did not match expected shape:",
      JSON.stringify(parsed),
      validationErr
    );
    return {
      error:
        "The AI response did not match the expected news item format. Nothing was saved — please try again.",
      status: 502,
    };
  }

  // Honest sourcing: keep a URL only if it appears verbatim in the student's
  // pasted text — anything else would be the model's invention.
  items = items.map((item) =>
    item.url && pastedText.includes(item.url) ? item : { ...item, url: undefined }
  );
  return { raw, structured: { items, sourceMode: "manual" } };
}

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

    const result =
      newsMode === "grounded"
        ? await getGroundedNews(studentPrompt)
        : await getManualNews(studentPrompt);

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const entry = await prisma.entry.create({
      data: {
        groupId,
        type: "NEWS_UPDATE",
        content: JSON.stringify(result.structured),
      },
    });
    await prisma.promptLog.createMany({
      data: [
        { groupId, entryId: entry.id, role: "STUDENT", content: studentPrompt },
        { groupId, entryId: entry.id, role: "AI", content: result.raw },
      ],
    });

    return NextResponse.json({ entryId: entry.id, newsUpdate: result.structured });
  } catch (err) {
    console.error("POST /api/news-update failed:", err);
    return NextResponse.json({ error: "News update failed" }, { status: 500 });
  }
}
