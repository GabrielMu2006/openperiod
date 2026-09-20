import "server-only";
import { sql } from "drizzle-orm";
import { getDatabase } from "@/src/server/db";
import { authRateLimits } from "@/src/server/db/schema";
import { HttpError } from "@/src/server/http";

export const AI_DAILY_LIMIT = 10;
export const AI_QUOTA_TIME_ZONE = "Asia/Shanghai";

const SHANGHAI_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;

export function nextAiQuotaResetAt(now = new Date()) {
  // Asia/Shanghai has no daylight-saving transition and remains UTC+8.
  const shanghaiNow = new Date(now.getTime() + SHANGHAI_UTC_OFFSET_MS);
  return new Date(Date.UTC(
    shanghaiNow.getUTCFullYear(),
    shanghaiNow.getUTCMonth(),
    shanghaiNow.getUTCDate() + 1,
  ) - SHANGHAI_UTC_OFFSET_MS);
}

export async function consumeAiImportAttempt(userId: string, now = new Date()) {
  const key = `ai-import:${userId}`;
  const resetAt = nextAiQuotaResetAt(now);
  const nowIso = now.toISOString();
  const resetAtIso = resetAt.toISOString();

  // The single upsert is the quota reservation: competing app instances cannot
  // both pass the limit, and a later provider failure intentionally keeps it.
  const [allowed] = await getDatabase().insert(authRateLimits).values({ key, count: 1, resetAt })
    .onConflictDoUpdate({
      target: authRateLimits.key,
      set: {
        count: sql`case when ${authRateLimits.resetAt} <= ${nowIso} then 1 else ${authRateLimits.count} + 1 end`,
        resetAt: sql`case when ${authRateLimits.resetAt} <= ${nowIso} then ${resetAtIso}::timestamptz else ${authRateLimits.resetAt} end`,
      },
      setWhere: sql`${authRateLimits.resetAt} <= ${nowIso} or ${authRateLimits.count} < ${AI_DAILY_LIMIT}`,
    })
    .returning({ key: authRateLimits.key });

  if (!allowed) {
    throw new HttpError(429, `今天的 AI 识别次数已用完（每天 ${AI_DAILY_LIMIT} 次，北京时间 00:00 重置）`);
  }

  return { limit: AI_DAILY_LIMIT, resetAt };
}
