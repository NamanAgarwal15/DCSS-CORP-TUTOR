/** How a group's two reflection inputs are recorded in the STUDENT prompt log. */
export function formatReflectionInput(classSummary: string, unclearQuestion: string): string {
  return `Class summary:\n${classSummary}\n\nQuestion we couldn't get clarified:\n${unclearQuestion}`;
}

/** One conversational tutor turn: a chat-style answer plus 2-3 follow-up questions. */
export type TutorTurn = { tutorReply: string; followUps: string[] };

export const MAX_TUTOR_REPLY = 4000;

/** Validate a tutor turn from the model (or the seed file). Throws on a bad shape. */
export function validateTutorTurn(obj: unknown): TutorTurn {
  if (typeof obj !== "object" || obj === null) throw new Error("Expected a JSON object");
  const { tutorReply, followUps } = obj as Record<string, unknown>;
  if (typeof tutorReply !== "string" || !tutorReply.trim()) {
    throw new Error("tutorReply must be a non-empty string");
  }
  if (tutorReply.length > MAX_TUTOR_REPLY) {
    throw new Error(`tutorReply must be at most ${MAX_TUTOR_REPLY} characters`);
  }
  if (!Array.isArray(followUps) || !followUps.every((f) => typeof f === "string" && f.trim())) {
    throw new Error("followUps must be an array of non-empty strings");
  }
  if (followUps.length < 2 || followUps.length > 3) {
    throw new Error(`expected 2 to 3 followUps, got ${followUps.length}`);
  }
  return { tutorReply: tutorReply.trim(), followUps: (followUps as string[]).map((f) => f.trim()) };
}

const SUMMARY_HEAD = "Class summary:\n";
const QUESTION_HEAD = "\n\nQuestion we couldn't get clarified:\n";

/** Inverse of formatReflectionInput: split a STUDENT log back into its two fields, or null. */
export function parseReflectionInput(text: string): { summary: string; question: string } | null {
  if (!text.startsWith(SUMMARY_HEAD)) return null;
  const i = text.indexOf(QUESTION_HEAD);
  if (i === -1) return null;
  return { summary: text.slice(SUMMARY_HEAD.length, i), question: text.slice(i + QUESTION_HEAD.length) };
}
