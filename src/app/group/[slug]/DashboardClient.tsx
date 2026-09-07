"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type EntryDTO = {
  id: string;
  type: string; // REFLECTION | NEWS_UPDATE | STUDENT_NOTE
  content: string;
  createdAt: string;
};

type PromptLogDTO = {
  id: string;
  role: string; // STUDENT | AI
  content: string;
  entryId: string | null;
  createdAt: string;
};

type GroupDTO = { id: string; name: string; slug: string };

type ReflectionContent = { keyPoints: string[]; openQuestion: string };
type NewsItem = { source: string; url?: string; summary: string; whyItMatters: string };
type NewsContent = { items: NewsItem[]; sourceMode?: string };
type NoteContent = { text: string };
type NewsMode = "grounded" | "manual";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString();
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
    </div>
  );
}

function NewsCard({ content }: { content: NewsContent }) {
  if (!content.items?.length) return <p className="text-gray-600">No items found.</p>;
  return (
    <ul className="space-y-4">
      {content.items.map((item, i) => (
        <li key={i} className="border-l-2 border-blue-400 pl-3">
          <p className="font-semibold text-gray-900">
            {item.url ? (
              <a href={item.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                {item.source}
              </a>
            ) : (
              item.source
            )}
          </p>
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
          <span className={`text-xs font-semibold px-2 py-0.5 rounded ${m.cls}`}>{m.title}</span>
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
          {isStudent ? "Prompt · STUDENT" : "Response · AI"}
        </span>
        <span className="text-xs text-gray-500">{formatDate(log.createdAt)}</span>
      </div>
      <p className="whitespace-pre-wrap text-gray-700">{log.content}</p>
    </div>
  );
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
  const [aiPrompt, setAiPrompt] = useState("");
  const [busy, setBusy] = useState<"" | "reflection" | "news" | "note">("");
  const [error, setError] = useState<string | null>(null);

  const feed = [
    ...entries.map((e) => ({ kind: "entry" as const, at: e.createdAt, data: e })),
    ...promptLogs.map((p) => ({ kind: "log" as const, at: p.createdAt, data: p })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!note.trim()) return;
    setError(null);
    setBusy("note");
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId: group.id, content: note.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save note");
      setNote("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy("");
    }
  }

  async function runAI(kind: "reflection" | "news") {
    if (!aiPrompt.trim()) {
      setError("Enter a prompt for the AI first.");
      return;
    }
    setError(null);
    setBusy(kind);
    try {
      const res = await fetch(`/api/${kind === "reflection" ? "reflection" : "news-update"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId: group.id, studentPrompt: aiPrompt.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "AI request failed");
      setAiPrompt("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy("");
    }
  }

  const reflectionBusy = busy === "reflection";
  const newsBusy = busy === "news";

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-3xl mx-auto">
        <p className="text-sm mb-1">
          <Link href="/instructor" className="text-blue-600 hover:underline">
            ← Instructor view
          </Link>
        </p>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">{group.name}</h1>
        <p className="text-sm text-gray-500 mb-6">
          Share this link so group members can join:{" "}
          <code className="bg-gray-200 rounded px-1.5 py-0.5">/group/{group.slug}</code>
        </p>

        <div className="bg-white rounded-lg shadow p-4 mb-6 space-y-4">
          <div>
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
              <h2 className="font-semibold text-gray-900 mb-2">AI Tutor</h2>
            )}
            <textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder={
                newsMode === "manual"
                  ? "Paste one or more news items here (with links/descriptions if you have them)…"
                  : "e.g. Reflect on our progress this fortnight: we validated 5 customer interviews and pivoted our pricing model…"
              }
              rows={newsMode === "manual" ? 5 : 3}
              className="w-full text-gray-900 border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex gap-3 mt-3">
              <button
                onClick={() => runAI("reflection")}
                disabled={!!busy}
                className="bg-purple-600 text-white rounded px-4 py-2 hover:bg-purple-700 disabled:opacity-50"
              >
                {reflectionBusy ? "Running reflection…" : "Run Class Reflection"}
              </button>
              <button
                onClick={() => runAI("news")}
                disabled={!!busy}
                className="bg-blue-600 text-white rounded px-4 py-2 hover:bg-blue-700 disabled:opacity-50"
              >
                {newsBusy
                  ? "Structuring pasted news…"
                  : newsMode === "manual"
                    ? "Submit pasted news"
                    : "Run Fortnightly Update"}
              </button>
            </div>
          </div>

          <form onSubmit={addNote} className="border-t pt-4">
            <h2 className="font-semibold text-gray-900 mb-2">Add a student note</h2>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Free-form note for the group…"
              rows={2}
              className="w-full text-gray-900 border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
          Group feed {feed.length === 0 && <span className="font-normal text-gray-500">(empty)</span>}
        </h2>
        <div className="space-y-3">
          {feed.map((item) =>
            item.kind === "entry" ? (
              <EntryCard key={item.data.id} entry={item.data} />
            ) : (
              <PromptLogCard key={item.data.id} log={item.data} />
            )
          )}
          {feed.length === 0 && (
            <p className="text-gray-500 text-sm">
              No entries yet — add a note or run the AI tutor above.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
