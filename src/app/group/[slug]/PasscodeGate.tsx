"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PasscodeGate({ slug }: { slug: string }) {
  const router = useRouter();
  const [passcode, setPasscode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/groups/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, passcode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Wrong passcode");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm bg-white rounded-lg shadow p-6 space-y-4">
        <h1 className="text-lg font-semibold text-gray-900">Enter group passcode</h1>
        <p className="text-sm text-gray-600">Ask a group member for the passcode.</p>
        <input
          type="password"
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          placeholder="Passcode"
          required
          className="w-full text-gray-900 border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={busy || !passcode}
          className="w-full bg-blue-600 text-white rounded px-4 py-2 hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? "Checking…" : "Open group"}
        </button>
        {error && <p className="text-red-600 text-sm">{error}</p>}
      </form>
    </main>
  );
}
