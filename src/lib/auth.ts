import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

// ---- Passcode hashing (scrypt, salted). Stored format: scrypt$<saltHex>$<hashHex>

const KEY_LEN = 64;

export function hashSecret(plain: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(plain, salt, KEY_LEN);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifySecret(plain: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(plain, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
}

/** Constant-time string comparison (hash both sides so lengths always match). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

// ---- Signed cookies: base64url(JSON payload) + "." + base64url(HMAC-SHA256)

type Payload = { kind: "group"; groupId: string; exp: number } | { kind: "faculty"; exp: number };

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("AUTH_SECRET is not set (or shorter than 16 characters)");
  }
  return secret;
}

function mac(data: string): string {
  return createHmac("sha256", getSecret()).update(data).digest("base64url");
}

export function signToken(payload: Payload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${mac(body)}`;
}

export function verifyToken(token: string | undefined): Payload | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = Buffer.from(mac(body));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as Payload;
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

// ---- Cookie names and options

export const FACULTY_COOKIE = "tutor_faculty";
export const groupCookieName = (groupId: string) => `tutor_group_${groupId}`;

const GROUP_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const FACULTY_MAX_AGE = 60 * 60 * 12; // 12 hours

export function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export function groupCookie(groupId: string) {
  const exp = Date.now() + GROUP_MAX_AGE * 1000;
  return {
    name: groupCookieName(groupId),
    value: signToken({ kind: "group", groupId, exp }),
    options: cookieOptions(GROUP_MAX_AGE),
  };
}

export function facultyCookie() {
  const exp = Date.now() + FACULTY_MAX_AGE * 1000;
  return {
    name: FACULTY_COOKIE,
    value: signToken({ kind: "faculty", exp }),
    options: cookieOptions(FACULTY_MAX_AGE),
  };
}

// ---- Request-time checks (read the incoming request's cookies)

export async function requireFaculty(): Promise<boolean> {
  const store = await cookies();
  const p = verifyToken(store.get(FACULTY_COOKIE)?.value);
  return p?.kind === "faculty";
}

/** True if the request carries a valid cookie for this group, or a faculty session. */
export async function requireGroupAccess(groupId: string): Promise<boolean> {
  if (await requireFaculty()) return true;
  const store = await cookies();
  const p = verifyToken(store.get(groupCookieName(groupId))?.value);
  return p?.kind === "group" && p.groupId === groupId;
}

/** Faculty credentials from env; false if either env var is missing. */
export function checkFacultyCredentials(username: string, password: string): boolean {
  const u = process.env.FACULTY_USERNAME;
  const pw = process.env.FACULTY_PASSWORD;
  if (!u || !pw) return false;
  // Evaluate both comparisons regardless of the first result.
  const okU = safeEqual(username, u);
  const okP = safeEqual(password, pw);
  return okU && okP;
}
