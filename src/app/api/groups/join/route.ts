import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badJson, MAX, rateLimited, readJson, str } from "@/lib/http";

/**
 * POST { query } → { slug }. `query` may be a group slug, a pasted
 * `/group/<slug>` link, or the exact group name. This only resolves which
 * group to open; the passcode gate on the dashboard still applies.
 */
export async function POST(req: Request) {
  const limited = rateLimited(req, "join", 20, 60_000);
  if (limited) return limited;

  try {
    const body = await readJson(req);
    if (!body) return badJson();
    const raw = str(body, "query");
    // Only a pasted link is reduced to its slug; names are matched as typed.
    const link = raw.match(/\/group\/([^/?#\s]+)/);
    const query = link ? link[1] : raw;
    if (!query || query.length > MAX.groupName) {
      return NextResponse.json({ error: "Enter a group name or slug" }, { status: 400 });
    }

    const matches = await prisma.group.findMany({
      where: { OR: [{ slug: query }, { name: query }] },
      select: { slug: true, name: true },
      take: 10,
    });
    // An exact slug match wins; otherwise the name must be unambiguous.
    const bySlug = matches.find((g) => g.slug === query);
    if (bySlug) return NextResponse.json({ slug: bySlug.slug });
    if (matches.length === 1) return NextResponse.json({ slug: matches[0].slug });
    if (matches.length > 1) {
      return NextResponse.json(
        { error: "More than one group has that name — use the group's slug or link instead" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "No group found with that name or slug" }, { status: 404 });
  } catch (err) {
    console.error("POST /api/groups/join failed:", err);
    return NextResponse.json({ error: "Join failed" }, { status: 500 });
  }
}
