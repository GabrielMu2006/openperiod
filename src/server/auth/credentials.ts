import "server-only";
import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import type { z } from "zod";
import type { ChallengePurpose, completeChallengeSchema } from "@/src/domain/auth";
import { placeholderNicknameFor, isPlaceholderNickname } from "@/src/domain/identity";
import { getDatabase } from "@/src/server/db";
import { authMailEvents, passwordChallenges, sessions, users, type UserRow } from "@/src/server/db/schema";
import { HttpError } from "@/src/server/http";
import { sendVerificationMail } from "@/src/server/mail/directmail";
import { hashPassword, verifyPassword } from "./password";
import { consumeAuthAttempt } from "./rate-limit";
import { prepareSession } from "./session";
import { assertEmailVerificationConfigured } from "./verification";
import { CODE_TTL_MS, evaluateSendPermission } from "./verification-policy";

type Transaction = Parameters<Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]>[0];

async function lockEmail(tx: Transaction, email: string) {
  // Shared by all issuance, login and credential mutations, including absent users.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${email}, 0))`);
}

function codeSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new HttpError(503, "邮箱验证服务暂不可用，请稍后重试");
  return secret;
}

function hashCode(id: string, email: string, purpose: ChallengePurpose, code: string) {
  return createHmac("sha256", codeSecret()).update(JSON.stringify([id, email, purpose, code])).digest("hex");
}

function eligible(user: UserRow | undefined, purpose: ChallengePurpose) {
  if (purpose === "REGISTER") return !user;
  if (purpose === "SET_PASSWORD") return Boolean(user && !user.passwordHash);
  return Boolean(user?.passwordHash);
}

function publicUser(user: UserRow) {
  return { id: user.id, email: user.email, nickname: user.nickname, scheduleId: user.scheduleId,
    defaultPrivacyLevel: user.defaultPrivacyLevel, emailVerifiedAt: user.emailVerifiedAt, hasPassword: Boolean(user.passwordHash) };
}

async function invalidateChallenges(tx: Transaction, email: string, now: Date) {
  await tx.update(passwordChallenges).set({ consumedAt: now })
    .where(and(eq(passwordChallenges.email, email), isNull(passwordChallenges.consumedAt)));
}

async function issueSession(tx: Transaction, user: UserRow) {
  const session = prepareSession(user.id, user.authVersion);
  await tx.insert(sessions).values(session.record);
  return { session, user: publicUser(user), needsNickname: isPlaceholderNickname(user.nickname, user.email) };
}

export async function requestPasswordChallenge(email: string, purpose: ChallengePurpose) {
  assertEmailVerificationConfigured();
  codeSecret();
  await consumeAuthAttempt("request", email);
  const challengeId = randomUUID();
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const shouldSend = await getDatabase().transaction(async (tx) => {
    await lockEmail(tx, email);
    const now = new Date();
    const [latest] = await tx.select().from(authMailEvents).where(eq(authMailEvents.email, email)).orderBy(desc(authMailEvents.createdAt)).limit(1);
    const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(authMailEvents)
      .where(and(eq(authMailEvents.email, email), gt(authMailEvents.createdAt, new Date(now.getTime() - 24 * 60 * 60_000))));
    const permission = evaluateSendPermission(now, latest?.createdAt ?? null, count);
    if (!permission.allowed) throw new HttpError(429, permission.reason === "cooldown"
      ? `发送太频繁，请 ${Math.ceil(permission.retryAfterMs / 1000)} 秒后再试`
      : "过去 24 小时申请次数已达上限（5 次），请稍后再试");
    await tx.insert(authMailEvents).values({ email, createdAt: now });
    const [user] = await tx.select().from(users).where(eq(users.email, email)).limit(1);
    if (!eligible(user, purpose)) return false;
    await invalidateChallenges(tx, email, now);
    await tx.insert(passwordChallenges).values({ id: challengeId, email, purpose,
      codeHash: hashCode(challengeId, email, purpose, code), createdAt: now, expiresAt: new Date(now.getTime() + CODE_TTL_MS) });
    return true;
  });
  if (shouldSend) {
    try {
      await sendVerificationMail(email, code, purpose);
    } catch {
      // Never restore an earlier code or refund the durable send reservation.
      await getDatabase().update(passwordChallenges).set({ consumedAt: new Date() }).where(eq(passwordChallenges.id, challengeId));
      // Keep the public result identical to an ineligible/unknown account, even
      // when the mail provider fails. Do not log the recipient or provider payload.
      console.warn("Verification email delivery failed");
    }
  }
  return { verificationRequired: true, challengeId, email, purpose,
    message: "如果邮箱符合所选操作条件，验证码将发送到该邮箱。" };
}

export async function completePasswordChallenge(input: z.infer<typeof completeChallengeSchema>) {
  codeSecret();
  await consumeAuthAttempt("verify", input.email);
  const result = await getDatabase().transaction(async (tx) => {
    await lockEmail(tx, input.email);
    const now = new Date();
    const [challenge] = await tx.select().from(passwordChallenges).where(and(
      eq(passwordChallenges.id, input.challengeId), eq(passwordChallenges.email, input.email), eq(passwordChallenges.purpose, input.purpose),
    )).limit(1);
    const invalid = { error: new HttpError(400, "验证码无效或已过期，请重新获取") };
    if (!challenge || challenge.consumedAt || challenge.expiresAt <= now || challenge.attempts >= 5) return invalid;
    const suppliedHash = hashCode(input.challengeId, input.email, input.purpose, input.code);
    if (!timingSafeEqual(Buffer.from(challenge.codeHash, "hex"), Buffer.from(suppliedHash, "hex"))) {
      await tx.update(passwordChallenges).set({ attempts: sql`${passwordChallenges.attempts} + 1` }).where(eq(passwordChallenges.id, challenge.id));
      // Returning (rather than throwing) commits the failed-attempt counter.
      return { error: new HttpError(400, "验证码不正确") };
    }
    const [existing] = await tx.select().from(users).where(eq(users.email, input.email)).limit(1);
    if (!eligible(existing, input.purpose)) return invalid;
    const passwordHash = await hashPassword(input.password);
    const [user] = existing
      ? await tx.update(users).set({ passwordHash, authVersion: existing.authVersion + 1, emailVerifiedAt: now, updatedAt: now })
        .where(eq(users.id, existing.id)).returning()
      : await tx.insert(users).values({ email: input.email, nickname: placeholderNicknameFor(input.email),
        passwordHash, authVersion: 1, emailVerifiedAt: now }).returning();
    await invalidateChallenges(tx, input.email, now);
    await tx.delete(sessions).where(eq(sessions.userId, user.id));
    return issueSession(tx, user);
  });
  if ("error" in result) throw result.error;
  return result;
}

export async function loginWithPassword(email: string, password: string) {
  await consumeAuthAttempt("login", email);
  const [observed] = await getDatabase().select().from(users).where(eq(users.email, email)).limit(1);
  const valid = await verifyPassword(observed?.passwordHash ?? null, password);
  const invalid = () => new HttpError(401, "邮箱或密码不正确；老账号请先设置密码");
  if (!valid || !observed?.emailVerifiedAt) throw invalid();
  return getDatabase().transaction(async (tx) => {
    await lockEmail(tx, email);
    const [user] = await tx.select().from(users).where(eq(users.email, email)).limit(1);
    // A concurrent password reset must not authenticate a previously verified hash.
    if (!user || user.passwordHash !== observed.passwordHash || user.authVersion !== observed.authVersion) throw invalid();
    return issueSession(tx, user);
  });
}

export async function changePassword(userId: string, currentPassword: string, password: string) {
  const [observed] = await getDatabase().select().from(users).where(eq(users.id, userId)).limit(1);
  if (!observed) throw new HttpError(401, "请重新登录");
  await consumeAuthAttempt("login", observed.email);
  if (!await verifyPassword(observed.passwordHash, currentPassword)) throw new HttpError(400, "当前密码不正确");
  const passwordHash = await hashPassword(password);
  return getDatabase().transaction(async (tx) => {
    await lockEmail(tx, observed.email);
    const [user] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user || user.passwordHash !== observed.passwordHash || user.authVersion !== observed.authVersion) throw new HttpError(401, "身份状态已变化，请重新登录");
    const now = new Date();
    const [updated] = await tx.update(users).set({ passwordHash, authVersion: user.authVersion + 1, updatedAt: now }).where(eq(users.id, userId)).returning();
    await invalidateChallenges(tx, user.email, now);
    await tx.delete(sessions).where(eq(sessions.userId, userId));
    return issueSession(tx, updated);
  });
}
