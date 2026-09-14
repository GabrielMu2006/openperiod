import { describe, expect, it } from "vitest";
import { PERIOD_COUNT, periodRange, periodRangeMinutes } from "@/src/config/period-times";
import { buildFreeRuns, formatDuration, type SlotGrid } from "./free-runs";
import { WEEKDAYS } from "./schedule";

function grid(freeByPeriod: Record<number, boolean>): SlotGrid {
  return Object.fromEntries(WEEKDAYS.map((weekday) => [weekday, Object.fromEntries(
    Array.from({ length: PERIOD_COUNT }, (_, index) => index + 1).map((period) => [
      String(period),
      { commonFree: weekday === "monday" && Boolean(freeByPeriod[period]), freeCount: 0, selectedUsers: 2 },
    ]),
  )])) as SlotGrid;
}

describe("periodRange", () => {
  it("maps consecutive periods to real clock times", () => {
    expect(periodRange(3, 4)).toEqual({ start: "10:10", end: "12:00" });
    expect(periodRangeMinutes(1, 2)).toEqual({ startMin: 480, endMin: 590 });
  });

  it("returns null for out-of-range periods", () => {
    expect(periodRange(0, 2)).toBeNull();
    expect(periodRange(11, 13)).toBeNull();
  });
});

describe("buildFreeRuns", () => {
  it("merges consecutive free periods into runs per weekday", () => {
    const slots = grid({ 1: true, 2: true, 3: false, 4: true, 5: true, 6: true });
    const runs = buildFreeRuns(slots);
    expect(runs).toEqual([
      { weekday: "monday", startPeriod: 1, endPeriod: 2 },
      { weekday: "monday", startPeriod: 4, endPeriod: 6 },
    ]);
  });

  it("excludes past slots before building runs", () => {
    const slots = grid({ 1: true, 2: true });
    const runs = buildFreeRuns(slots, (_weekday, period) => period === 1);
    expect(runs).toEqual([{ weekday: "monday", startPeriod: 2, endPeriod: 2 }]);
  });

  it("returns an empty list when nothing is free", () => {
    expect(buildFreeRuns(grid({}))).toEqual([]);
  });
});

describe("formatDuration", () => {
  it("formats minutes and hours", () => {
    expect(formatDuration(50)).toBe("50 分钟");
    expect(formatDuration(110)).toBe("1 小时 50 分");
    expect(formatDuration(120)).toBe("2 小时");
    expect(formatDuration(0)).toBe("0 分钟");
  });
});
