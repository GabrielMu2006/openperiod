import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDatabase } from "@/src/server/db";
import { sessions, users } from "@/src/server/db/schema";

const COOKIE_NAME = "openperiod_session";
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await getDatabase().insert(sessions).values({
    tokenHash: hashToken(token),
    userId,
    expiresAt,
  });

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    // 生产默认要求 HTTPS；备案前的 IP 直连阶段可通过 ALLOW_INSECURE_COOKIE=1 临时放开
    secure: process.env.NODE_ENV === "production" && process.env.ALLOW_INSECURE_COOKIE !== "1",
    path: "/",
    expires: expiresAt,
  });
}

export async function getCurrentUser() {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;

  const [user] = await getDatabase()
    .select({
      id: users.id,
      nickname: users.nickname,
      email: users.email,
      defaultPrivacyLevel: users.defaultPrivacyLevel,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);

  return user ?? null;
}

export async function deleteCurrentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (token) {
    await getDatabase().delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  }
  cookieStore.delete(COOKIE_NAME);
}
