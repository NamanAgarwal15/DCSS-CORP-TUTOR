"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function Home() {
  const router = useRouter();
  const [groupName, setGroupName] = useState("");
  const [passcode, setPasscode] = useState("");
  const [joinSlug, setJoinSlug] = useState("");
  const [createName, setCreateName] = useState("");
  const [joinName, setJoinName] = useState("");
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Remember the group and the self-reported student name for this browser.
  function remember(slug: string, studentName: string) {
    try {
      localStorage.setItem("lastGroupSlug", slug);
      localStorage.setItem("studentName", studentName);
    } catch {
      // Storage unavailable (e.g. private mode): posts will be unattributed.
    }
  }

  async function createGroup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!createName.trim()) {
      setError("Enter your name");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: groupName, passcode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create group");
      remember(data.slug, createName.trim());
      router.push(`/group/${data.slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setCreating(false);
    }
  }

  async function joinGroup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!joinSlug.trim() || !joinName.trim()) {
      setError("Enter the group name or slug and your name");
      return;
    }
    setJoining(true);
    try {
      const res = await fetch("/api/groups/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: joinSlug }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not find that group");
      remember(data.slug, joinName.trim());
      router.push(`/group/${data.slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setJoining(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Corporate Startup Tutor</h1>
        <p className="text-gray-600 mb-8">
          An AI Agent Tutor for student groups — class reflections, fortnightly corporate-startup
          news updates, and shared notes.
        </p>

        <div className="grid md:grid-cols-2 gap-6">
          <form
            onSubmit={createGroup}
            className="bg-white rounded-lg shadow p-6 space-y-4"
          >
            <h2 className="text-lg font-semibold text-gray-900">Create a new group</h2>
            <input
              type="text"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="Your name"
              maxLength={60}
              required
              className="w-full text-gray-900 border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="e.g. Team Alpha"
              required
              className="w-full text-gray-900 border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="Group passcode (min 6 characters)"
              minLength={6}
              required
              className="w-full text-gray-900 border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={creating || !createName.trim() || !groupName.trim() || passcode.length < 6}
              className="w-full bg-blue-600 text-white rounded px-4 py-2 hover:bg-blue-700 disabled:opacity-50"
            >
              {creating ? "Creating…" : "Create group"}
            </button>
          </form>

          <form
            onSubmit={joinGroup}
            className="bg-white rounded-lg shadow p-6 space-y-4"
          >
            <h2 className="text-lg font-semibold text-gray-900">Join an existing group</h2>
            <input
              type="text"
              value={joinName}
              onChange={(e) => setJoinName(e.target.value)}
              placeholder="Your name"
              maxLength={60}
              required
              className="w-full text-gray-900 border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="text"
              value={joinSlug}
              onChange={(e) => setJoinSlug(e.target.value)}
              placeholder="Group name, slug or link"
              required
              className="w-full text-gray-900 border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={joining || !joinName.trim() || !joinSlug.trim()}
              className="w-full bg-gray-800 text-white rounded px-4 py-2 hover:bg-gray-900 disabled:opacity-50"
            >
              {joining ? "Joining…" : "Join group"}
            </button>
          </form>
        </div>

        {error && <p className="mt-4 text-red-600 text-sm">{error}</p>}

        <p className="mt-8 text-sm">
          <Link href="/faculty/login" className="text-blue-600 hover:underline">
            Faculty login →
          </Link>
        </p>
      </div>
    </main>
  );
}
