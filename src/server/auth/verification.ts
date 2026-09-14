import "server-only";
import { createHash, randomInt } from "node:crypto";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { getDatabase } from "@/src/server/db";
import { emailVerificationCodes, users } from "@/src/server/db/schema";
import {
  CODE_TTL_MS,
  DAILY_CODE_LIMIT,
  evaluateSendPermission,
} from "@/src/server/auth/verification-policy";
import { directMailConfigured, sendVerificationMail } from "@/src/server/mail/directmail";
import { HttpError } from "@/src/server/http";

export function isEmailVerificationEnabled() {
  return directMailConfigured();
}

const MAX_VERIFY_ATTEMPTS = 5;

function hashCode(userId: string, code: string) {
  return createHash("sha256").update(`${userId}:${code}`).digest("hex");
}

export async function issueEmailCode(userId: string, email: string) {
  const database = getDatabase();
  const [latest] = await database
    .select({ createdAt: emailVerificationCodes.createdAt })
    .from(emailVerificationCodes)
    .where(eq(emailVerificationCodes.userId, userId))
    .orderBy(desc(emailVerificationCodes.createdAt))
    .limit(1);
  const [{ count: recentCount }] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(emailVerificationCodes)
    .where(and(eq(emailVerificationCodes.userId, userId), gt(emailVerificationCodes.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000))));

  const permission = evaluateSendPermission(new Date(), latest?.createdAt ?? null, recentCount);
  if (!permission.allowed) {
    const seconds = Math.ceil(permission.retryAfterMs / 1000);
    const message = permission.reason === "cooldown" ? `发送太频繁，请 ${seconds} 秒后再试` : `今天发送次数已达上限（${DAILY_CODE_LIMIT} 次），请明天再试`;
    throw new HttpError(429, message);
  }

  // 顺手清理该用户已过期的验证码
  await database
    .delete(emailVerificationCodes)
    .where(and(eq(emailVerificationCodes.userId, userId), sql`${emailVerificationCodes.expiresAt} < now()`));

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await database.insert(emailVerificationCodes).values({
    userId,
    codeHash: hashCode(userId, code),
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  });

  try {
    await sendVerificationMail(email, code);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, "验证码邮件发送失败，请稍后重试");
  }
}

export async function verifyEmailCode(userId: string, code: string) {
  const database = getDatabase();
  const [record] = await database
    .select()
    .from(emailVerificationCodes)
    .where(and(eq(emailVerificationCodes.userId, userId), isNull(emailVerificationCodes.consumedAt), gt(emailVerificationCodes.expiresAt, new Date())))
    .orderBy(desc(emailVerificationCodes.createdAt))
    .limit(1);

  if (!record) throw new HttpError(400, "验证码已过期，请重新获取");
  if (record.attempts >= MAX_VERIFY_ATTEMPTS) throw new HttpError(400, "尝试次数过多，请重新获取验证码");

  if (record.codeHash !== hashCode(userId, code.trim())) {
    await database
      .update(emailVerificationCodes)
      .set({ attempts: record.attempts + 1 })
      .where(eq(emailVerificationCodes.id, record.id));
    throw new HttpError(400, "验证码不正确");
  }

  const now = new Date();
  await database.update(emailVerificationCodes).set({ consumedAt: now }).where(eq(emailVerificationCodes.id, record.id));
  await database.update(users).set({ emailVerifiedAt: now, updatedAt: now }).where(eq(users.id, userId));
}
