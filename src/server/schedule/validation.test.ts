import { describe, expect, it } from "vitest";
import { busyMutationSchema, courseMutationSchema } from "./validation";

describe("schedule mutation validation", () => {
  it("normalizes course meeting weeks", () => {
    const result = courseMutationSchema.parse({
      name: "人工智能",
      meetings: [{ weekday: "tuesday", startPeriod: 7, endPeriod: 8, weeks: [5, 3, 3, 1] }],
    });
    expect(result.meetings[0].weeks).toEqual([1, 3, 5]);
  });

  it("rejects an inverted period range", () => {
    const result = courseMutationSchema.safeParse({
      name: "人工智能",
      meetings: [{ weekday: "tuesday", startPeriod: 8, endPeriod: 7, weeks: [1] }],
    });
    expect(result.success).toBe(false);
  });

  it("requires one-time busy blocks to contain exactly one week", () => {
    const result = busyMutationSchema.safeParse({
      kind: "ONE_TIME", weekday: "friday", startPeriod: 10, endPeriod: 11, weeks: [5, 6],
    });
    expect(result.success).toBe(false);
  });
});

