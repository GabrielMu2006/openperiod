import { describe, expect, it } from "vitest";
import { getTeachingWeek } from "./semester";
import type { Semester } from "@/src/domain/schedule";

const semester: Semester = {
  id: "fall",
  school: "PKU",
  academicYear: "2026–2027",
  semester: "秋季学期",
  startDate: "2026-09-07",
  weekCount: 16,
  timezone: "Asia/Shanghai",
};

describe("getTeachingWeek", () => {
  it("calculates weeks from configured start date", () => {
    expect(getTeachingWeek(semester, new Date("2026-09-07T12:00:00+08:00"))).toBe(1);
    expect(getTeachingWeek(semester, new Date("2026-10-06T12:00:00+08:00"))).toBe(5);
  });

  it("clamps dates outside the semester", () => {
    expect(getTeachingWeek(semester, new Date("2025-01-01T00:00:00+08:00"))).toBe(1);
    expect(getTeachingWeek(semester, new Date("2027-12-31T00:00:00+08:00"))).toBe(16);
  });
});
