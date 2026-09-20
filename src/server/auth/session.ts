import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNotNull, sql } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { getDatabase } from "@/src/server/db";
import { sessions, users } from "@/src/server/db/schema";
import { sessionCookieIsSecure } from "./cookie-security";
import { assertSecureProductionTransport } from "@/src/server/security/transport";

const COOKIE_NAME = "openperiod_session";
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

async function assertSecureSessionTransport(method: string) {
  if (process.env.NODE_ENV !== "production") return;
  const requestHeaders = await headers();
  const origin = process.env.AUTH_ORIGIN || "https://invalid.invalid";
  assertSecureProductionTransport({ method, url: `${origin}/`, headers: requestHeaders });
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function prepareSession(userId: string, authVersion: number) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  return { token, expiresAt, record: { tokenHash: hashToken(token), userId, authVersion, expiresAt } };
}

// Call only after the credential/session transaction has committed.
export async function setSessionCookie(session: ReturnType<typeof prepareSession>) {
  await assertSecureSessionTransport("POST");
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, session.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: sessionCookieIsSecure(process.env),
    priority: "high",
    path: "/",
    expires: session.expiresAt,
  });
}

export async function getCurrentUser() {
  await assertSecureSessionTransport("GET");
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;

  const [user] = await getDatabase()
    .select({
      id: users.id,
      nickname: users.nickname,
      email: users.email,
      defaultPrivacyLevel: users.defaultPrivacyLevel,
      scheduleId: users.scheduleId,
      emailVerifiedAt: users.emailVerifiedAt,
      hasPassword: sql<boolean>`${users.passwordHash} is not null`,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date()),
      eq(sessions.authVersion, users.authVersion), isNotNull(users.passwordHash), isNotNull(users.emailVerifiedAt)))
    .limit(1);

  return user ?? null;
}

export async function deleteCurrentSession() {
  await assertSecureSessionTransport("DELETE");
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (token) {
    await getDatabase().delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  }
  cookieStore.delete(COOKIE_NAME);
}
