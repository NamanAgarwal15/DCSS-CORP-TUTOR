/*
 * One-off cleanup: delete the obsolete group named exactly "projectfinaldcss"
 * and everything that belongs to it (its prompt logs and entries).
 *
 *   npx tsx scripts/cleanup.ts            dry run — shows what WOULD be deleted, changes nothing
 *   npx tsx scripts/cleanup.ts --confirm  actually deletes
 *
 * Safety: only groups whose name is exactly TARGET are touched — matched by
 * id, never by a broad filter — and all deletes run in one transaction, so a
 * failure part-way leaves the database unchanged. The schema has no cascade,
 * so rows are removed child-first: prompt logs, then entries, then the group.
 * Uses DATABASE_URL from the environment (.env), like the app.
 */
import { PrismaClient } from "@prisma/client";

const TARGET = "projectfinaldcss";

async function main() {
  const confirm = process.argv.includes("--confirm");
  const prisma = new PrismaClient();
  try {
    const all = await prisma.group.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, slug: true, _count: { select: { entries: true, promptLogs: true } } },
    });
    console.log(`groups in database (${all.length}):`);
    for (const g of all) {
      const mark = g.name === TARGET ? "  <-- will be deleted" : "";
      console.log(`  ${g.name} (${g.slug}): ${g._count.entries} entries, ${g._count.promptLogs} prompt logs${mark}`);
    }

    const targets = all.filter((g) => g.name === TARGET);
    if (targets.length === 0) {
      console.log(`\nNo group named "${TARGET}" — nothing to do.`);
      return;
    }
    if (!confirm) {
      console.log(`\nDRY RUN: ${targets.length} group(s) named "${TARGET}" would be deleted. Re-run with --confirm to delete.`);
      return;
    }

    const ids = targets.map((g) => g.id);
    const result = await prisma.$transaction(async (tx) => {
      const logs = await tx.promptLog.deleteMany({ where: { groupId: { in: ids } } });
      const entries = await tx.entry.deleteMany({ where: { groupId: { in: ids } } });
      const groups = await tx.group.deleteMany({ where: { id: { in: ids }, name: TARGET } });
      return { logs: logs.count, entries: entries.count, groups: groups.count };
    });
    console.log(`\nDELETED: ${result.groups} group(s), ${result.entries} entries, ${result.logs} prompt logs.`);
    const left = await prisma.group.findMany({ orderBy: { name: "asc" }, select: { name: true, slug: true } });
    console.log(`groups remaining (${left.length}): ${left.map((g) => `${g.name} (${g.slug})`).join(", ")}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("cleanup failed (nothing was deleted if this happened before DELETED):", e instanceof Error ? e.message : e);
  process.exit(1);
});
