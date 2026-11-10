import Link from "next/link";
import BackButton from "@/components/BackButton";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireFaculty } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function FacultyPage() {
  if (!(await requireFaculty())) redirect("/faculty/login");

  const groups = await prisma.group.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { entries: true } } },
  });

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-3xl mx-auto">
        <p className="mb-1">
          <BackButton href="/" label="Home" />
        </p>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Faculty — All Groups</h1>

        {groups.length === 0 ? (
          <p className="text-gray-500">No groups yet.</p>
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
