import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireGroupAccess } from "@/lib/auth";
import DashboardClient from "./DashboardClient";
import PasscodeGate from "./PasscodeGate";

export const dynamic = "force-dynamic";

export default async function GroupPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const found = await prisma.group.findUnique({ where: { slug }, select: { id: true } });
  if (!found) notFound();

  if (!(await requireGroupAccess(found.id))) {
    return <PasscodeGate slug={slug} />;
  }

  const group = await prisma.group.findUnique({
    where: { slug },
    include: {
      entries: { orderBy: { createdAt: "asc" } },
      promptLogs: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!group) notFound();

  return (
    <DashboardClient
      group={{ id: group.id, name: group.name, slug: group.slug }}
      newsMode={process.env.NEWS_MODE === "grounded" ? "grounded" : "manual"}
      entries={group.entries.map((e) => ({
        id: e.id,
        type: e.type,
        content: e.content,
        studentName: e.studentName,
        createdAt: e.createdAt.toISOString(),
      }))}
      promptLogs={group.promptLogs.map((p) => ({
        id: p.id,
        role: p.role,
        content: p.content,
        entryId: p.entryId,
        studentName: p.studentName,
        createdAt: p.createdAt.toISOString(),
      }))}
    />
  );
}
