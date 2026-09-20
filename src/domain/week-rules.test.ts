import { describe, expect, it } from "vitest";
import { parseWeekRule } from "./week-rules";

describe("parseWeekRule", () => {
  it("normalizes all, odd and even week rules", () => {
    expect(parseWeekRule("1–16周").weeks).toHaveLength(16);
    expect(parseWeekRule("单周").weeks).toEqual([1, 3, 5, 7, 9, 11, 13, 15]);
    expect(parseWeekRule("双周").weeks).toEqual([2, 4, 6, 8, 10, 12, 14, 16]);
  });

  it("parses custom lists and ranged parity", () => {
    expect(parseWeekRule("1,2,5,8,12").weeks).toEqual([1, 2, 5, 8, 12]);
    expect(parseWeekRule("3-11(单)").weeks).toEqual([3, 5, 7, 9, 11]);
  });

  it("marks an empty rule as needing confirmation", () => {
    expect(parseWeekRule("").recognized).toBe(false);
  });

  it("uses the target semester length for all, odd, even and late-week rules", () => {
    expect(parseWeekRule("1-20", 20)).toEqual({ weeks: Array.from({ length: 20 }, (_, index) => index + 1), recognized: true });
    expect(parseWeekRule("单周", 20).weeks).toEqual([1, 3, 5, 7, 9, 11, 13, 15, 17, 19]);
    expect(parseWeekRule("双周", 20).weeks).toEqual([2, 4, 6, 8, 10, 12, 14, 16, 18, 20]);
    expect(parseWeekRule("17-20", 20)).toEqual({ weeks: [17, 18, 19, 20], recognized: true });
  });
});
