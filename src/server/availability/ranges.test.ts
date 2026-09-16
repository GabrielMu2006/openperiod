import { describe, expect, it } from "vitest";
import { UIBE_SCHEDULE, getScheduleById } from "@/src/config/school-schedules";
import { buildMemberRanges } from "./data";

// 群的查看基准：北大 2026 秋，开学 2026-09-07（周一）
const GROUP_START = "2026-09-07";

function rangesFor(scheduleId: string | null, startDate: string, viewWeek: number, meetings: { weekday: number; startPeriod: number; endPeriod: number; weeks: number[] }[]) {
  return buildMemberRanges({
    memberSchedule: getScheduleById(scheduleId),
    memberStartDate: startDate,
    memberWeekCount: 16,
    groupStartDate: GROUP_START,
    viewWeek,
    meetings: meetings.map((meeting, index) => ({ id: String(index), ...meeting })),
    busyBlocks: [],
    skippedMeetingIds: new Set<string>(),
  });
}

describe("跨校可用性的日期与钟点换算", () => {
  it("同一日期，不同学校的课表各自换算成正确的周次与钟点区间", () => {
    // 北大成员：周一 3-4 节 = 10:10–12:00
    const pku = rangesFor(null, GROUP_START, 1, [
      { weekday: 1, startPeriod: 3, endPeriod: 4, weeks: [1] },
    ]);
    expect(pku.ranges.monday).toEqual([{ startMin: 610, endMin: 720 }]);

    // 对外经贸成员：周一第一大节 = 小节 1-2 = 08:00–09:30
    const uibe = rangesFor("uibe", GROUP_START, 1, [
      { weekday: 1, startPeriod: 1, endPeriod: 2, weeks: [1] },
    ]);
    expect(uibe.ranges.monday).toEqual([{ startMin: 480, endMin: 570 }]);

    // 两个区间在钟点轴上不重叠：09:30–10:10 是两人共同空闲
  });

  it("开学日不同的学校按日期对齐到各自的周次", () => {
    // 某校 9 月 14 日才开学：群的第 1 周（9/7–9/13）对该成员是开学前（第 0 周及以前），无课
    const lateStart = rangesFor(null, "2026-09-14", 1, [
      { weekday: 1, startPeriod: 3, endPeriod: 4, weeks: [1] },
    ]);
    expect(lateStart.ranges.monday).toEqual([]);

    // 群的第 2 周一（9/14）恰好是该校第 1 周：课表生效
    const aligned = rangesFor(null, "2026-09-14", 2, [
      { weekday: 1, startPeriod: 3, endPeriod: 4, weeks: [1] },
    ]);
    expect(aligned.ranges.monday).toHaveLength(1);
  });

  it("跳过周（SKIP）与周次范围照常生效", () => {
    const meetings = [
      { id: "m1", weekday: 1, startPeriod: 3, endPeriod: 4, weeks: [1, 2, 3] },
    ];
    const notSkipped = buildMemberRanges({
      memberSchedule: getScheduleById(null),
      memberStartDate: GROUP_START,
      memberWeekCount: 16,
      groupStartDate: GROUP_START,
      viewWeek: 2,
      meetings,
      busyBlocks: [],
      skippedMeetingIds: new Set(["m1"]),
    });
    expect(notSkipped.ranges.monday).toEqual([]);

    const outOfRange = buildMemberRanges({
      memberSchedule: getScheduleById(null),
      memberStartDate: GROUP_START,
      memberWeekCount: 16,
      groupStartDate: GROUP_START,
      viewWeek: 4,
      meetings,
      busyBlocks: [],
      skippedMeetingIds: new Set(),
    });
    expect(outOfRange.ranges.monday).toEqual([]);
  });

  it("UIBE 预设行的时间网格保持单调", () => {
    const rows = UIBE_SCHEDULE.rows;
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i].start >= rows[i - 1].end).toBe(true);
    }
  });
});
