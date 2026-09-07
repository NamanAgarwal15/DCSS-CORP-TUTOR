import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function InstructorPage() {
  const groups = await prisma.group.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { entries: true } } },
  });

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-3xl mx-auto">
        <p className="text-sm mb-1">
          <Link href="/" className="text-blue-600 hover:underline">
            ← Home
          </Link>
        </p>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Instructor — All Groups</h1>

        {groups.length === 0 ? (
          <p className="text-gray-500">
            No groups yet. Create one from the{" "}
            <Link href="/" className="text-blue-600 hover:underline">
              home page
            </Link>
            .
          </p>
        ) : (
          <ul className="space-y-3">
            {groups.map((g) => (
              <li key={g.id} className="bg-white rounded-lg shadow p-4">
                <Link href={`/group/${g.slug}`} className="font-semibold text-blue-600 hover:underline">
                  {g.name}
                </Link>
                <span className="text-sm text-gray-500 ml-2">
                  — {g._count.entries} {g._count.entries === 1 ? "entry" : "entries"}
                </span>
                <span className="block text-xs text-gray-400 mt-1">/group/{g.slug}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
