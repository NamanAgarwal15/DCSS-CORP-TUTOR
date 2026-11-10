"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDate } from "@/lib/formatDate";

type EntryDTO = {
  id: string;
  type: string; // REFLECTION | NEWS_UPDATE | STUDENT_NOTE
  content: string;
  studentName: string | null;
  createdAt: string;
};

type PromptLogDTO = {
  id: string;
  role: string; // STUDENT | AI
  content: string;
  entryId: string | null;
  studentName: string | null;
  createdAt: string;
};

type GroupDTO = { id: string; name: string; slug: string };

type ReflectionContent = {
  keyPoints: string[];
  openQuestion: string;
  // Present on conversational reflections; older entries have neither.
  tutorReply?: string;
  followUps?: string[];
};
type TutorTurn = { tutorReply: string; followUps: string[] };
type NewsItem = { source: string; url?: string; summary: string; whyItMatters: string };
type NewsContent = { items: NewsItem[]; sourceMode?: string };
type NoteContent = { text: string };
type NewsMode = "grounded" | "manual";


/** Tutor turn stored in an AI log row (JSON, possibly fenced), or null for older/raw rows. */
function parseTurn(raw: string): TutorTurn | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const o = JSON.parse(raw.slice(start, end + 1)) as Partial<TutorTurn>;
    if (typeof o.tutorReply !== "string" || !o.tutorReply.trim()) return null;
    const followUps = Array.isArray(o.followUps) ? o.followUps.filter((f) => typeof f === "string") : [];
    return { tutorReply: o.tutorReply, followUps };
  } catch {
    return null;
  }
}

function TutorBubble({ text }: { text: string }) {
  return (
    <div className="rounded-lg p-3 text-sm border bg-purple-50 border-purple-200">
      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-purple-200 text-purple-900">
        Tutor
      </span>
      <p className="mt-2 whitespace-pre-wrap text-gray-800">{text}</p>
    </div>
  );
}

function ReflectionCard({ content }: { content: ReflectionContent }) {
  return (
    <div>
      <ul className="list-disc pl-5 space-y-1 text-gray-800">
        {content.keyPoints.map((kp, i) => (
          <li key={i}>{kp}</li>
        ))}
      </ul>
      <p className="mt-3 text-blue-800">
        <span className="font-semibold">Open question: </span>
        {content.openQuestion}
      </p>
      {content.tutorReply && (
        <div className="mt-3">
          <TutorBubble text={content.tutorReply} />
        </div>
      )}
    </div>
  );
}

/** Reply box under a reflection: suggested follow-ups prefill it; sending continues the chat. */
function FollowUpBox({
  suggestions,
  disabled,
  sending,
  onSend,
}: {
  suggestions: string[];
  disabled: boolean;
  sending: boolean;
  onSend: (text: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (draft.trim() && (await onSend(draft.trim()))) setDraft("");
  }
  return (
    <form onSubmit={submit} className="space-y-2">
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {suggestions.map((q, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setDraft(q)}
              className="text-left text-xs bg-white border border-purple-300 text-purple-800 rounded-full px-3 py-1 hover:bg-purple-50"
            >
              {q}
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask the tutor a follow-up…"
          maxLength={3999}
          className={INPUT_CLS}
        />
        <button
          type="submit"
          disabled={disabled || !draft.trim()}
          className="bg-purple-600 text-white rounded px-4 py-2 hover:bg-purple-700 disabled:opacity-50 whitespace-nowrap"
        >
          {sending ? "Asking…" : "Ask"}
        </button>
      </div>
    </form>
  );
}

function NewsCard({ content }: { content: NewsContent }) {
  if (!content.items?.length) return <p className="text-gray-600">No items found.</p>;
  return (
    <ul className="space-y-4">
      {content.items.map((item, i) => (
        <li key={i} className="border-l-2 border-blue-400 pl-3">
          <p className="font-semibold text-gray-900">
            {item.url && /^https?:\/\//i.test(item.url) ? (
              <a href={item.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                {item.source}
              </a>
            ) : (
              item.source
            )}
          </p>
          {item.url && !/^https?:\/\//i.test(item.url) && (
            <p className="text-xs text-gray-500">{item.url}</p>
          )}
          <p className="text-gray-800">{item.summary}</p>
          <p className="text-sm text-gray-600 mt-1">
            <span className="font-medium">Why it matters: </span>
            {item.whyItMatters}
          </p>
        </li>
      ))}
    </ul>
  );
}

function NoteCard({ content }: { content: NoteContent }) {
  return <p className="whitespace-pre-wrap text-gray-800">{content.text}</p>;
}

function EntryCard({ entry }: { entry: EntryDTO }) {
  const meta: Record<string, { title: string; cls: string }> = {
    REFLECTION: { title: "Class Reflection", cls: "bg-purple-100 text-purple-800" },
    NEWS_UPDATE: { title: "Fortnightly News Update", cls: "bg-blue-100 text-blue-800" },
    STUDENT_NOTE: { title: "Student Note", cls: "bg-green-100 text-green-800" },
  };
  const m = meta[entry.type] ?? { title: entry.type, cls: "bg-gray-100 text-gray-800" };

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(entry.content);
  } catch {
    parsed = null;
  }

  const manuallyCurated =
    entry.type === "NEWS_UPDATE" &&
    typeof parsed === "object" &&
    parsed !== null &&
    (parsed as NewsContent).sourceMode === "manual";

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="flex items-center gap-2">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded ${m.cls}`}>
            {entry.type === "STUDENT_NOTE" && entry.studentName ? `${m.title} · ${entry.studentName}` : m.title}
          </span>
          {manuallyCurated && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-yellow-100 text-yellow-800">
              manually curated
            </span>
          )}
        </span>
        <span className="text-xs text-gray-500">{formatDate(entry.createdAt)}</span>
      </div>
      {entry.type === "REFLECTION" && parsed !== null && (
        <ReflectionCard content={parsed as ReflectionContent} />
      )}
      {entry.type === "NEWS_UPDATE" && parsed !== null && (
        <NewsCard content={parsed as NewsContent} />
      )}
      {entry.type === "STUDENT_NOTE" && parsed !== null && (
        <NoteCard content={parsed as NoteContent} />
      )}
      {parsed === null && <p className="text-gray-800 whitespace-pre-wrap">{entry.content}</p>}
    </div>
  );
}

function PromptLogCard({ log }: { log: PromptLogDTO }) {
  const isStudent = log.role === "STUDENT";
  return (
    <div
      className={`rounded-lg p-3 text-sm border ${
        isStudent ? "bg-gray-50 border-gray-200" : "bg-amber-50 border-amber-200"
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <span
          className={`text-xs font-semibold px-2 py-0.5 rounded ${
            isStudent ? "bg-gray-200 text-gray-700" : "bg-amber-200 text-amber-900"
          }`}
        >
          {isStudent ? `Prompt · ${log.studentName ?? "STUDENT"}` : "Response · AI"}
        </span>
        <span className="text-xs text-gray-500">{formatDate(log.createdAt)}</span>
      </div>
      <p className="whitespace-pre-wrap text-gray-700">{log.content}</p>
    </div>
  );
}

/** Name typed on the landing page (browser-only), or null if unavailable. */
function readStudentName(): string | null {
  try {
    return localStorage.getItem("studentName")?.trim() || null;
  } catch {
    return null;
  }
}

const INPUT_CLS =
  "w-full text-gray-900 border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500";

// One feed item: an AI turn (student message + tutor card + raw response),
// a note, or a log row that is not tied to any entry.
type FeedItem =
  | { kind: "turn"; at: string; entry: EntryDTO; student: PromptLogDTO[]; ai: PromptLogDTO[] }
  | { kind: "note"; at: string; entry: EntryDTO }
  | { kind: "log"; at: string; log: PromptLogDTO };

function buildFeed(entries: EntryDTO[], promptLogs: PromptLogDTO[]): FeedItem[] {
  const byEntry = new Map<string, PromptLogDTO[]>();
  const loose: PromptLogDTO[] = [];
  for (const p of promptLogs) {
    if (p.entryId) byEntry.set(p.entryId, [...(byEntry.get(p.entryId) ?? []), p]);
    else loose.push(p);
  }
  const items: FeedItem[] = entries.map((e) => {
    const logs = byEntry.get(e.id) ?? [];
    if (e.type === "STUDENT_NOTE" && logs.length === 0) {
      return { kind: "note", at: e.createdAt, entry: e };
    }
    return {
      kind: "turn",
      at: e.createdAt,
      entry: e,
      student: logs.filter((l) => l.role === "STUDENT"),
      ai: logs.filter((l) => l.role !== "STUDENT"),
    };
  });
  for (const l of loose) items.push({ kind: "log", at: l.createdAt, log: l });
  return items.sort((a, b) => a.at.localeCompare(b.at));
}

export default function DashboardClient({
  group,
  entries,
  promptLogs,
  newsMode,
}: {
  group: GroupDTO;
  entries: EntryDTO[];
  promptLogs: PromptLogDTO[];
  newsMode: NewsMode;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [classSummary, setClassSummary] = useState("");
  const [unclearQuestion, setUnclearQuestion] = useState("");
  const [newsText, setNewsText] = useState("");
  const [busy, setBusy] = useState<"" | "reflection" | "news" | "note" | "followup">("");
  const [followUpFor, setFollowUpFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const feed = buildFeed(entries, promptLogs);

  async function post(kind: "reflection" | "news" | "note" | "followup", url: string, payload: object) {
    setError(null);
    setBusy(kind);
    try {
      const studentName = readStudentName();
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId: group.id, ...payload, ...(studentName ? { studentName } : {}) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      router.refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      return false;
    } finally {
      setBusy("");
    }
  }

  async function runReflection(e: React.FormEvent) {
    e.preventDefault();
    if (!classSummary.trim() || !unclearQuestion.trim()) {
      setError("Fill in both the class summary and your unclear question.");
      return;
    }
    const ok = await post("reflection", "/api/reflection", {
      classSummary: classSummary.trim(),
      unclearQuestion: unclearQuestion.trim(),
    });
    if (ok) {
      setClassSummary("");
      setUnclearQuestion("");
    }
  }

  async function askFollowUp(entryId: string, followUp: string) {
    setFollowUpFor(entryId);
    const ok = await post("followup", "/api/reflection", { entryId, followUp });
    setFollowUpFor(null);
    return ok;
  }

  async function runNews(e: React.FormEvent) {
    e.preventDefault();
    if (!newsText.trim()) {
      setError("Paste some news content first.");
      return;
    }
    if (await post("news", "/api/news-update", { studentPrompt: newsText.trim() })) setNewsText("");
  }

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!note.trim()) return;
    if (await post("note", "/api/notes", { content: note.trim() })) setNote("");
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">{group.name}</h1>
        <p className="text-sm text-gray-500 mb-6">
          Share this link and the passcode with group members:{" "}
          <code className="bg-gray-200 rounded px-1.5 py-0.5">/group/{group.slug}</code>
        </p>

        <div className="bg-white rounded-lg shadow p-4 mb-6 space-y-4">
          <form onSubmit={runReflection}>
            <h2 className="font-semibold text-gray-900 mb-2">Class Reflection</h2>
            <label className="block text-sm text-gray-600 mb-1">What was covered in class?</label>
            <textarea
              value={classSummary}
              onChange={(e) => setClassSummary(e.target.value)}
              placeholder="Summarise today's class in your own words…"
              rows={4}
              maxLength={3999}
              className={INPUT_CLS}
            />
            <label className="block text-sm text-gray-600 mt-3 mb-1">
              One question your group couldn&apos;t get clarified
            </label>
            <textarea
              value={unclearQuestion}
              onChange={(e) => setUnclearQuestion(e.target.value)}
              placeholder="e.g. How are equity-free pilots usually structured?"
              rows={2}
              maxLength={3999}
              className={INPUT_CLS}
            />
            <button
              type="submit"
              disabled={!!busy}
              className="mt-3 bg-purple-600 text-white rounded px-4 py-2 hover:bg-purple-700 disabled:opacity-50"
            >
              {busy === "reflection" ? "Running reflection…" : "Run Class Reflection"}
            </button>
          </form>

          <form onSubmit={runNews} className="border-t pt-4">
            {newsMode === "manual" ? (
              <>
                <h2 className="font-semibold text-gray-900 mb-2">
                  Fortnightly Update — paste news items
                </h2>
                <p className="text-sm text-gray-600 mb-2">
                  Paste raw news content below (e.g. LinkedIn posts, company announcements).
                  The AI will structure it — these are manually curated items, not live
                  web search results.
                </p>
              </>
            ) : (
              <h2 className="font-semibold text-gray-900 mb-2">Fortnightly Update</h2>
            )}
            <textarea
              value={newsText}
              onChange={(e) => setNewsText(e.target.value)}
              placeholder={
                newsMode === "manual"
                  ? "Paste one or more news items here (with links/descriptions if you have them)…"
                  : "Optional focus for the news search, e.g. corporate venture capital in fintech…"
              }
              rows={newsMode === "manual" ? 5 : 2}
              maxLength={8000}
              className={INPUT_CLS}
            />
            <button
              type="submit"
              disabled={!!busy}
              className="mt-3 bg-blue-600 text-white rounded px-4 py-2 hover:bg-blue-700 disabled:opacity-50"
            >
              {busy === "news"
                ? "Structuring pasted news…"
                : newsMode === "manual"
                  ? "Submit pasted news"
                  : "Run Fortnightly Update"}
            </button>
          </form>

          <form onSubmit={addNote} className="border-t pt-4">
            <h2 className="font-semibold text-gray-900 mb-2">Add a student note</h2>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Free-form note for the group…"
              rows={2}
              maxLength={2000}
              className={INPUT_CLS}
            />
            <button
              type="submit"
              disabled={!!busy || !note.trim()}
              className="mt-2 bg-green-600 text-white rounded px-4 py-2 hover:bg-green-700 disabled:opacity-50"
            >
              {busy === "note" ? "Saving…" : "Add note"}
            </button>
          </form>

          {error && <p className="text-red-600 text-sm">{error}</p>}
        </div>

        <h2 className="text-lg font-semibold text-gray-900 mb-3">
          Group history{" "}
          {feed.length === 0 && <span className="font-normal text-gray-500">(empty)</span>}
        </h2>
        <div className="space-y-6">
          {feed.map((item) => {
            if (item.kind === "note") return <EntryCard key={item.entry.id} entry={item.entry} />;
            if (item.kind === "log") return <PromptLogCard key={item.log.id} log={item.log} />;
            // First student/AI pair is the original turn; later pairs are follow-ups.
            const [firstStudent, ...laterStudent] = item.student;
            const [firstAi, ...laterAi] = item.ai;
            const isReflection = item.entry.type === "REFLECTION";
            let suggestions: string[] = [];
            if (isReflection) {
              const lastTurn = laterAi.length ? parseTurn(laterAi[laterAi.length - 1].content) : null;
              try {
                suggestions =
                  lastTurn?.followUps ??
                  ((JSON.parse(item.entry.content) as ReflectionContent).followUps ?? []);
              } catch {
                suggestions = [];
              }
            }
            const rawAi = (l: PromptLogDTO) => (
              <details key={`raw-${l.id}`} className="text-sm">
                <summary className="text-xs text-gray-500 cursor-pointer">Raw AI response</summary>
                <PromptLogCard log={l} />
              </details>
            );
            return (
              <div key={item.entry.id} className="space-y-2">
                {firstStudent && <PromptLogCard log={firstStudent} />}
                <EntryCard entry={item.entry} />
                {firstAi && rawAi(firstAi)}
                {laterStudent.map((l, i) => {
                  const ai = laterAi[i];
                  const turn = ai ? parseTurn(ai.content) : null;
                  return (
                    <div key={l.id} className="space-y-2">
                      <PromptLogCard log={l} />
                      {ai && turn && <TutorBubble text={turn.tutorReply} />}
                      {ai && rawAi(ai)}
                    </div>
                  );
                })}
                {laterAi.slice(laterStudent.length).map(rawAi)}
                {isReflection && (
                  <FollowUpBox
                    suggestions={suggestions}
                    disabled={!!busy}
                    sending={busy === "followup" && followUpFor === item.entry.id}
                    onSend={(text) => askFollowUp(item.entry.id, text)}
                  />
                )}
              </div>
            );
          })}
          {feed.length === 0 && (
            <p className="text-gray-500 text-sm">
              No entries yet — run a reflection, paste news, or add a note above.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
