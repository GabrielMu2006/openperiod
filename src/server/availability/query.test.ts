import { describe, expect, it } from "vitest";
import { availabilityDetailQuerySchema, availabilityQuerySchema } from "./query";

const alice = "11111111-1111-4111-8111-111111111111";
const bob = "22222222-2222-4222-8222-222222222222";

describe("availability API query", () => {
  it("parses and deduplicates selected users", () => {
    const result = availabilityQuerySchema.parse({ week: "5", users: `${alice},${bob},${alice}` });
    expect(result).toEqual({ week: 5, users: [alice, bob] });
  });

  it("rejects periods and weeks outside the PKU V1 grid", () => {
    expect(availabilityQuerySchema.safeParse({ week: 17, users: alice }).success).toBe(false);
    expect(availabilityDetailQuerySchema.safeParse({ week: 5, users: alice, weekday: "monday", period: 13 }).success).toBe(false);
  });
});
