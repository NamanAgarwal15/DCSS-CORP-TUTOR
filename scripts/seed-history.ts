/*
 * Seed-history importer.
 *
 *   npx tsx scripts/seed-history.ts [path/to/data.json] [--append | --replace]
 *   (default file: scripts/seed-data.json)
 *
 * Loads past reflections, news updates and notes into an EXISTING group
 * (create it in the app first, with its passcode), found by "groupSlug" or by
 * its exact "groupName". Rows are written exactly like the live API writes
 * them — same Entry.content shape and the same STUDENT/AI PromptLog pairs — so
 * seeded history looks like normal history. Optional per item: "studentName";
 * for reflections "tutorReply" + "followUps"; and for reflections and news
 * updates a "thread" of follow-up exchanges. See scripts/seed-data.example.json for the format.
 *
 * Everything is validated first; nothing is written unless the whole file is
 * valid. A group that already has entries is refused unless --append is given,
 * so running the script twice does not silently duplicate history.
 * --replace instead removes that ONE group's existing entries and prompt logs
 * (the group, its slug and passcode are kept) and writes the file in the same
 * transaction — if anything fails, the old history is left untouched.
 */
import { readFileSync } from "fs";
import { PrismaClient } from "@prisma/client";
import { validateNewsItems, validateReflection, type NewsItem } from "../src/lib/gemini";
import { formatReflectionInput, validateTutorTurn, type TutorTurn } from "../src/lib/reflection";
import { MAX } from "../src/lib/http";

type PlannedLog = { role: "STUDENT" | "AI"; content: string; studentName: string | null; createdAt: Date };
type Planned = {
  type: "REFLECTION" | "NEWS_UPDATE" | "STUDENT_NOTE";
  createdAt: Date;
  content: string;
  studentName: string | null;
  logs: PlannedLog[];
};

function fail(msg: string): never {
  console.error(`seed-history: ${msg}`);
  process.exit(1);
}

function text(item: Record<string, unknown>, key: string, max: number, where: string): string {
  const v = item[key];
  if (typeof v !== "string" || !v.trim()) fail(`${where}: "${key}" must be a non-empty string`);
  const t = v.trim();
  if (t.length > max) fail(`${where}: "${key}" is longer than ${max} characters`);
  return t;
}

function optName(item: Record<string, unknown>, where: string): string | null {
  if (item.studentName === undefined) return null;
  return text(item, "studentName", MAX.studentName, where);
}

function date(item: Record<string, unknown>, fallback: Date, where: string): Date {
  if (item.createdAt === undefined) return fallback;
  if (typeof item.createdAt !== "string" || Number.isNaN(Date.parse(item.createdAt))) {
    fail(`${where}: createdAt must be an ISO date string`);
  }
  return new Date(item.createdAt);
}

function turn(obj: unknown, where: string): TutorTurn {
  try {
    return validateTutorTurn(obj);
  } catch (e) {
    fail(`${where}: ${(e as Error).message}`);
  }
}

/** Follow-up exchanges after an entry: each becomes a STUDENT/AI log pair, strictly in time order. */
function planThread(item: Record<string, unknown>, createdAt: Date, where: string): PlannedLog[] {
  if (item.thread === undefined) return [];
  if (!Array.isArray(item.thread)) fail(`${where}: "thread" must be an array`);
  const logs: PlannedLog[] = [];
  let last = createdAt;
  item.thread.forEach((t: unknown, j: number) => {
    const w = `${where}.thread[${j}]`;
    if (typeof t !== "object" || t === null) fail(`${w} is not an object`);
    const th = t as Record<string, unknown>;
    // Default: one minute after the previous turn, so order is stable.
    const at = date(th, new Date(last.getTime() + 60_000), w);
    if (at <= last) fail(`${w}: createdAt must be after the previous turn`);
    last = at;
    const question = text(th, "question", MAX.reflectionField - 1, w);
    const reply = turn(th, w);
    logs.push(
      { role: "STUDENT", content: question, studentName: optName(th, w), createdAt: at },
      { role: "AI", content: JSON.stringify(reply), studentName: null, createdAt: at }
    );
  });
  return logs;
}

function plan(raw: unknown, i: number, now: Date): Planned {
  const where = `items[${i}]`;
  if (typeof raw !== "object" || raw === null) fail(`${where} is not an object`);
  const item = raw as Record<string, unknown>;
  const createdAt = date(item, now, where);
  const studentName = optName(item, where);

  switch (item.type) {
    case "REFLECTION": {
      const classSummary = text(item, "classSummary", MAX.reflectionField - 1, where);
      const unclearQuestion = text(item, "unclearQuestion", MAX.reflectionField - 1, where);
      let reflection;
      try {
        reflection = validateReflection({ keyPoints: item.keyPoints, openQuestion: unclearQuestion });
      } catch (e) {
        fail(`${where}: ${(e as Error).message}`);
      }
      if (reflection.keyPoints.length < 3 || reflection.keyPoints.length > 5) {
        fail(`${where}: keyPoints must have 3 to 5 items`);
      }
      // Conversational fields are optional (older history has none).
      const conv =
        item.tutorReply !== undefined || item.followUps !== undefined ? turn(item, where) : null;
      const content = conv ? { ...reflection, ...conv } : reflection;

      const logs: PlannedLog[] = [
        { role: "STUDENT", content: formatReflectionInput(classSummary, unclearQuestion), studentName, createdAt },
        { role: "AI", content: JSON.stringify(conv ? { keyPoints: reflection.keyPoints, ...conv } : { keyPoints: reflection.keyPoints }), studentName: null, createdAt },
      ];

      if (item.thread !== undefined && !conv) fail(`${where}: "thread" needs tutorReply and followUps on the reflection`);
      logs.push(...planThread(item, createdAt, where));
      return { type: "REFLECTION", createdAt, content: JSON.stringify(content), studentName, logs };
    }
    case "NEWS_UPDATE": {
      const pastedText = text(item, "pastedText", MAX.newsPaste, where);
      let items: NewsItem[];
      try {
        items = validateNewsItems(item.items);
      } catch (e) {
        fail(`${where}: ${(e as Error).message}`);
      }
      // Same honest-sourcing rule as the live manual mode.
      items = items.map((n) =>
        n.url && pastedText.includes(n.url) ? n : { ...n, url: undefined }
      );
      return {
        type: "NEWS_UPDATE",
        createdAt,
        content: JSON.stringify({ items, sourceMode: "manual" }),
        studentName,
        logs: [
          { role: "STUDENT", content: pastedText, studentName, createdAt },
          { role: "AI", content: JSON.stringify(items), studentName: null, createdAt },
          ...planThread(item, createdAt, where),
        ],
      };
    }
    case "STUDENT_NOTE": {
      const note = text(item, "text", MAX.note, where);
      return { type: "STUDENT_NOTE", createdAt, content: JSON.stringify({ text: note }), studentName, logs: [] };
    }
    default:
      fail(`${where}: type must be REFLECTION, NEWS_UPDATE or STUDENT_NOTE`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const append = args.includes("--append");
  const replace = args.includes("--replace");
  if (append && replace) fail("use either --append or --replace, not both");
  const file = args.find((a) => !a.startsWith("--")) ?? "scripts/seed-data.json";
  let data: { groupSlug?: unknown; groupName?: unknown; items?: unknown };
  try {
    data = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    fail(`could not read ${file}: ${(e as Error).message}`);
  }
  const slug = typeof data.groupSlug === "string" ? data.groupSlug.trim() : "";
  const name = typeof data.groupName === "string" ? data.groupName.trim() : "";
  if (!slug && !name) fail(`"groupSlug" or "groupName" is required`);
  if (!Array.isArray(data.items) || data.items.length === 0) fail(`"items" must be a non-empty array`);

  const now = new Date();
  const planned = data.items.map((it, i) => plan(it, i, now));

  const prisma = new PrismaClient();
  try {
    const matches = await prisma.group.findMany({
      where: slug ? { slug } : { name },
      select: { id: true, name: true, slug: true, _count: { select: { entries: true } } },
      take: 2,
    });
    const target = slug ? `slug "${slug}"` : `name "${name}"`;
    if (matches.length === 0) fail(`no group with ${target} — create it in the app first`);
    if (matches.length > 1) fail(`more than one group has ${target} — use "groupSlug" instead`);
    const group = matches[0];
    if (group._count.entries > 0 && !append && !replace) {
      fail(
        `group "${group.name}" already has ${group._count.entries} entries — pass --append to add anyway, or --replace to swap them out`
      );
    }

    await prisma.$transaction(
      async (tx) => {
        if (replace) {
          const logs = await tx.promptLog.deleteMany({ where: { groupId: group.id } });
          const entries = await tx.entry.deleteMany({ where: { groupId: group.id } });
          console.log(`seed-history: --replace removed ${entries.count} entries and ${logs.count} prompt logs from "${group.name}"`);
        }
        for (const p of planned) {
          const entry = await tx.entry.create({
            data: { groupId: group.id, type: p.type, content: p.content, studentName: p.studentName, createdAt: p.createdAt },
          });
          if (p.logs.length) {
            await tx.promptLog.createMany({
              data: p.logs.map((l) => ({
                groupId: group.id,
                entryId: entry.id,
                role: l.role,
                content: l.content,
                studentName: l.studentName,
                createdAt: l.createdAt,
              })),
            });
          }
        }
      },
      { timeout: 60_000 }
    );
    const logCount = planned.reduce((n, p) => n + p.logs.length, 0);
    console.log(
      `seed-history: wrote ${planned.length} entries and ${logCount} prompt logs into "${group.name}" (${group.slug})`
    );
  } finally {
    await prisma.$disconnect();
  }
}

main();
