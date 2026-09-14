export const CODE_TTL_MS = 15 * 60 * 1000;
export const RESEND_COOLDOWN_MS = 60 * 1000;
export const DAILY_CODE_LIMIT = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

export type SendPermission =
  | { allowed: true }
  | { allowed: false; reason: "cooldown" | "daily_limit"; retryAfterMs: number };

export function evaluateSendPermission(
  now: Date,
  lastCodeCreatedAt: Date | null,
  codesCreatedInLastDay: number,
): SendPermission {
  if (codesCreatedInLastDay >= DAILY_CODE_LIMIT) {
    return { allowed: false, reason: "daily_limit", retryAfterMs: DAY_MS };
  }
  if (lastCodeCreatedAt) {
    const elapsed = now.getTime() - lastCodeCreatedAt.getTime();
    if (elapsed < RESEND_COOLDOWN_MS) {
      return { allowed: false, reason: "cooldown", retryAfterMs: RESEND_COOLDOWN_MS - elapsed };
    }
  }
  return { allowed: true };
}
