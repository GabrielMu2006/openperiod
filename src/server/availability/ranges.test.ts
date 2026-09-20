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
    skipsByMeeting: new Map(),
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

  it("跳过只作用于被标记的那一周，其余周照常上课（AV-01）", () => {
    const meetings = [
      { id: "m1", weekday: 1, startPeriod: 3, endPeriod: 4, weeks: [1, 2, 3] },
    ];
    const skipOnlyWeek2 = new Map([["m1", new Set([2])]]);
    const build = (viewWeek: number) => buildMemberRanges({
      memberSchedule: getScheduleById(null),
      memberStartDate: GROUP_START,
      memberWeekCount: 16,
      groupStartDate: GROUP_START,
      viewWeek,
      meetings,
      busyBlocks: [],
      skipsByMeeting: skipOnlyWeek2,
    });
    // 第 2 周标记「不去」：该周无课
    expect(build(2).ranges.monday).toEqual([]);
    // 第 3 周照常上课；第 4 周超出上课周次，无课
    expect(build(3).ranges.monday).toEqual([{ startMin: 610, endMin: 720 }]);
    expect(build(4).ranges.monday).toEqual([]);
  });

  it("跨校开学日不同时，跳过按成员自己的教学周匹配（AV-01）", () => {
    // 成员学校 9/14 开学：群第 2 周（9/14 当周）= 成员第 1 周
    const skipMemberWeek1 = new Map([["m1", new Set([1])]]);
    const build = (viewWeek: number) => buildMemberRanges({
      memberSchedule: getScheduleById("uibe"),
      memberStartDate: "2026-09-14",
      memberWeekCount: 16,
      groupStartDate: GROUP_START,
      viewWeek,
      meetings: [{ id: "m1", weekday: 1, startPeriod: 1, endPeriod: 2, weeks: [1, 2] }],
      busyBlocks: [],
      skipsByMeeting: skipMemberWeek1,
    });
    // 群第 2 周换算为成员第 1 周：跳过生效
    expect(build(2).ranges.monday).toEqual([]);
    // 群第 3 周 = 成员第 2 周：未被跳过，照常按 UIBE 钟点出现
    expect(build(3).ranges.monday).toEqual([{ startMin: 480, endMin: 570 }]);
  });

  it("UIBE 预设行的时间网格保持单调", () => {
    const rows = UIBE_SCHEDULE.rows;
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i].start >= rows[i - 1].end).toBe(true);
    }
  });
});
