import { GoogleGenerativeAI, type Tool } from "@google/generative-ai";

// Spec pinned gemini-2.0-flash, but Google deprecated that model server-side
// (404 "no longer available"); gemini-2.5-flash is likewise unavailable to new
// API keys. gemini-3.6-flash is the API's suggested Flash replacement and was
// verified working (plain + grounded) against this key.
const MODEL_NAME = "gemini-3.6-flash";

// Type-only cast: SDK 0.24.1's Tool type predates the `googleSearch` field the
// API now expects. The object sent at runtime is unchanged.
export const GOOGLE_SEARCH_TOOL = [{ googleSearch: {} }] as unknown as Tool[];

function getClient(): GoogleGenerativeAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set in the environment");
  }
  return new GoogleGenerativeAI(apiKey);
}

export function getGeminiModel(tools?: Tool[]) {
  return getClient().getGenerativeModel(
    tools ? { model: MODEL_NAME, tools } : { model: MODEL_NAME }
  );
}

/**
 * Extract a JSON string from a raw Gemini response.
 * Tolerates ```json code fences and trailing commentary after the JSON block.
 */
export function extractJson(raw: string): string {
  let text = raw.trim();

  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();

  const start = text.search(/[{[]/);
  if (start === -1) throw new Error("No JSON found in model response");

  const open = text[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inStr = false;
  let esc = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') {
      inStr = true;
    } else if (ch === open) {
      depth++;
    } else if (ch === close) {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  throw new Error("Unterminated JSON in model response");
}

export type ReflectionResult = { keyPoints: string[]; openQuestion: string };

export function validateReflection(obj: unknown): ReflectionResult {
  if (typeof obj !== "object" || obj === null) throw new Error("Expected a JSON object");
  const { keyPoints, openQuestion } = obj as Record<string, unknown>;
  if (!Array.isArray(keyPoints) || !keyPoints.every((k) => typeof k === "string" && k.trim())) {
    throw new Error("keyPoints must be a non-empty array of strings");
  }
  if (typeof openQuestion !== "string" || !openQuestion.trim()) {
    throw new Error("openQuestion must be a non-empty string");
  }
  return { keyPoints: keyPoints as string[], openQuestion };
}

export type NewsItem = { source: string; url?: string; summary: string; whyItMatters: string };

export function validateNewsItems(obj: unknown): NewsItem[] {
  if (!Array.isArray(obj)) throw new Error("Expected a JSON array of news items");
  return obj.map((item, i) => {
    if (typeof item !== "object" || item === null) throw new Error(`Item ${i} is not an object`);
    const { source, url, summary, whyItMatters } = item as Record<string, unknown>;
    if (typeof source !== "string" || !source.trim())
      throw new Error(`Item ${i}: source must be a non-empty string`);
    if (typeof summary !== "string" || !summary.trim())
      throw new Error(`Item ${i}: summary must be a non-empty string`);
    if (typeof whyItMatters !== "string" || !whyItMatters.trim())
      throw new Error(`Item ${i}: whyItMatters must be a non-empty string`);
    return {
      source,
      url: typeof url === "string" && url.trim() ? url : undefined,
      summary,
      whyItMatters,
    };
  });
}

/**
 * Pull real source URLs out of the grounding metadata returned with a
 * Google-Search-grounded response, keyed by matching chunk title to the
 * source name Gemini wrote in its own JSON.
 */
export function extractGroundingSources(response: any): { uri: string; title: string }[] {
  const chunks = response?.candidates?.[0]?.groundingMetadata?.groundingChunks;
  if (!Array.isArray(chunks)) return [];
  const out: { uri: string; title: string }[] = [];
  for (const c of chunks) {
    const web = c?.web;
    if (web?.uri) out.push({ uri: web.uri, title: web.title ?? "" });
  }
  return out;
}
