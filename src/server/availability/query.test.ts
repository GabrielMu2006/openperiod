import { describe, expect, it } from "vitest";
import { availabilityDetailQuerySchema, availabilityQuerySchema } from "./query";

const alice = "11111111-1111-4111-8111-111111111111";
const bob = "22222222-2222-4222-8222-222222222222";

describe("availability API query", () => {
  it("parses and deduplicates selected users", () => {
    const result = availabilityQuerySchema.parse({ week: "5", users: `${alice},${bob},${alice}` });
    expect(result).toEqual({ week: 5, users: [alice, bob] });
  });

  it("rejects periods and weeks outside the static caps; week validity is semester-driven", () => {
    // 17 周在静态上限内，实际是否合法由数据层按群组学期的周数校验（SCH-02）
    expect(availabilityQuerySchema.safeParse({ week: 17, users: alice }).success).toBe(true);
    expect(availabilityQuerySchema.safeParse({ week: 0, users: alice }).success).toBe(false);
    expect(availabilityQuerySchema.safeParse({ week: 53, users: alice }).success).toBe(false);
    // 最多 16 个学校作息行 + 4 个跨校晚间追加行（TIME-01）
    expect(availabilityDetailQuerySchema.safeParse({ week: 5, users: alice, weekday: "monday", period: 17 }).success).toBe(true);
    expect(availabilityDetailQuerySchema.safeParse({ week: 5, users: alice, weekday: "monday", period: 20 }).success).toBe(true);
    expect(availabilityDetailQuerySchema.safeParse({ week: 5, users: alice, weekday: "monday", period: 21 }).success).toBe(false);
    // 13-16 节在多学校支持后合法（如南大 14 节制）
    expect(availabilityDetailQuerySchema.safeParse({ week: 5, users: alice, weekday: "monday", period: 14 }).success).toBe(true);
  });
});
