import { describe, expect, it } from "vitest";
import {
  CODE_TTL_MS,
  DAILY_CODE_LIMIT,
  RESEND_COOLDOWN_MS,
  evaluateSendPermission,
} from "./verification-policy";

const NOW = new Date("2026-09-14T08:00:00Z");

describe("evaluateSendPermission", () => {
  it("allows the first send", () => {
    expect(evaluateSendPermission(NOW, null, 0)).toEqual({ allowed: true });
  });

  it("blocks during the resend cooldown", () => {
    const recent = new Date(NOW.getTime() - RESEND_COOLDOWN_MS / 2);
    const result = evaluateSendPermission(NOW, recent, 1);
    expect(result).toMatchObject({ allowed: false, reason: "cooldown" });
    if (!result.allowed) expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it("allows again after the cooldown passes", () => {
    const old = new Date(NOW.getTime() - RESEND_COOLDOWN_MS - 1000);
    expect(evaluateSendPermission(NOW, old, 1)).toEqual({ allowed: true });
  });

  it("blocks after the daily limit regardless of cooldown", () => {
    const recent = new Date(NOW.getTime() - 1000);
    const result = evaluateSendPermission(NOW, recent, DAILY_CODE_LIMIT);
    expect(result).toMatchObject({ allowed: false, reason: "daily_limit" });
  });

  it("keeps the code TTL independent of the policy", () => {
    expect(CODE_TTL_MS).toBe(15 * 60 * 1000);
  });
});
