import type { Semester } from "@/src/domain/schedule";

export const DEFAULT_SEMESTER: Semester = {
  id: "pku-2026-fall",
  school: "PKU",
  academicYear: "2026–2027",
  semester: "秋季学期",
  startDate: process.env.OPENPERIOD_SEMESTER_START ?? "2026-09-07",
  weekCount: 16,
  timezone: "Asia/Shanghai",
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function getTeachingWeek(semester: Semester, now = new Date()): number {
  const start = new Date(`${semester.startDate}T00:00:00+08:00`);
  if (Number.isNaN(start.getTime())) throw new Error("Invalid semester start date");

  const rawWeek = Math.floor((now.getTime() - start.getTime()) / (DAY_MS * 7)) + 1;
  return Math.min(semester.weekCount, Math.max(1, rawWeek));
}
