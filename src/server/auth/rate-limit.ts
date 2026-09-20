import "server-only";
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDatabase } from "@/src/server/db";
import { authRateLimits } from "@/src/server/db/schema";
import { HttpError } from "@/src/server/http";

export async function consumeAuthAttempt(kind: "login" | "request" | "verify", email: string) {
  const key = `${kind}:${createHash("sha256").update(email).digest("hex")}`;
  const now = new Date();
  const resetAt = new Date(now.getTime() + 15 * 60_000);
  // This statement commits separately, including when the later authentication fails.
  const [allowed] = await getDatabase().insert(authRateLimits).values({ key, count: 1, resetAt })
    .onConflictDoUpdate({
      target: authRateLimits.key,
      set: {
        count: sql`case when ${authRateLimits.resetAt} <= ${now.toISOString()} then 1 else ${authRateLimits.count} + 1 end`,
        resetAt: sql`case when ${authRateLimits.resetAt} <= ${now.toISOString()} then ${resetAt.toISOString()}::timestamptz else ${authRateLimits.resetAt} end`,
      },
      setWhere: sql`${authRateLimits.resetAt} <= ${now.toISOString()} or ${authRateLimits.count} < 10`,
    }).returning({ key: authRateLimits.key });
  if (!allowed) throw new HttpError(429, "尝试过于频繁，请 15 分钟后再试");
}
