import { NextResponse } from "next/server";
import { checkFacultyCredentials, facultyCookie } from "@/lib/auth";
import { badJson, MAX, rateLimited, readJson } from "@/lib/http";

/** POST { username, password } → sets the faculty session cookie on success. */
export async function POST(req: Request) {
  const limited = rateLimited(req, "faculty-login", 10, 60_000);
  if (limited) return limited;

  const body = await readJson(req);
  if (!body) return badJson();
  const username = typeof body.username === "string" ? body.username : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!username || !password || username.length > MAX.credential || password.length > MAX.credential) {
    return NextResponse.json({ error: "username and password are required" }, { status: 400 });
  }

  if (!checkFacultyCredentials(username, password)) {
    return NextResponse.json({ error: "Wrong username or password" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  const c = facultyCookie();
  res.cookies.set(c.name, c.value, c.options);
  return res;
}
