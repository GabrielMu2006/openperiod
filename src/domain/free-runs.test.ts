import { describe, expect, it } from "vitest";
import { periodRange, periodRangeMinutes } from "@/src/config/period-times";
import { buildFreeRuns, formatClock, formatDuration } from "./free-runs";
import { WEEKDAYS, type Weekday } from "./schedule";

function intervals(list: [number, number][]) {
  return Object.fromEntries(WEEKDAYS.map((weekday) => [
    weekday,
    weekday === "monday" ? list.map(([startMin, endMin]) => ({ startMin, endMin })) : [],
  ])) as Record<Weekday, { startMin: number; endMin: number }[]>;
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
  it("builds runs from clock-axis common free intervals", () => {
    const runs = buildFreeRuns(intervals([[480, 600], [720, 900]]));
    expect(runs).toEqual([
      { weekday: "monday", startMin: 480, endMin: 600 },
      { weekday: "monday", startMin: 720, endMin: 900 },
    ]);
  });

  it("drops intervals that have fully passed today", () => {
    const runs = buildFreeRuns(intervals([[480, 600], [720, 900]]), (weekday, run) => weekday === "monday" && run.endMin <= 600);
    expect(runs).toEqual([{ weekday: "monday", startMin: 720, endMin: 900 }]);
  });

  it("keeps an ongoing interval intact", () => {
    const runs = buildFreeRuns(intervals([[480, 600]]), (weekday, run) => weekday === "monday" && run.endMin <= 500);
    expect(runs).toEqual([{ weekday: "monday", startMin: 480, endMin: 600 }]);
  });

  it("returns an empty list when nothing is free", () => {
    expect(buildFreeRuns(intervals([]))).toEqual([]);
  });
});

describe("formatDuration / formatClock", () => {
  it("formats minutes, hours and clock labels", () => {
    expect(formatDuration(50)).toBe("50 分钟");
    expect(formatDuration(110)).toBe("1 小时 50 分");
    expect(formatDuration(120)).toBe("2 小时");
    expect(formatDuration(0)).toBe("0 分钟");
    expect(formatClock(480)).toBe("08:00");
    expect(formatClock(730)).toBe("12:10");
  });
});
