import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCHEDULE,
  MAX_PERIOD_COUNT,
  PKU_SCHEDULE,
  getScheduleById,
  getScheduleForSemester,
  listSchedulePresets,
  periodRangeIn,
  periodRangeMinutesIn,
  type SchedulePreset,
} from "./school-schedules";

function toMinutes(hhmm: string) {
  const [hours, minutes] = hhmm.split(":").map(Number);
  return hours * 60 + minutes;
}

// 所有预设都必须满足的不变量：网格连续、时间单调不重叠、不超过全局节次上限
function expectValidPreset(preset: SchedulePreset) {
  expect(preset.rows.length, `${preset.id} 行数`).toBeGreaterThan(0);
  expect(preset.rows.length, `${preset.id} 行数上限`).toBeLessThanOrEqual(MAX_PERIOD_COUNT);
  preset.rows.forEach((row, index) => {
    expect(row.period, `${preset.id} 第 ${index + 1} 行节次号`).toBe(index + 1);
    expect(toMinutes(row.end), `${preset.id} 第 ${row.period} 节结束`).toBeGreaterThan(toMinutes(row.start));
    if (index > 0) {
      const previous = preset.rows[index - 1];
      expect(toMinutes(row.start), `${preset.id} 第 ${row.period} 节开始`).toBeGreaterThanOrEqual(toMinutes(previous.end));
    }
  });
  if (preset.kind === "block") {
    expect(preset.blocks?.length, `${preset.id} 大节数`).toBeGreaterThan(0);
    preset.blocks?.forEach((block) => {
      expect(block.from, `${preset.id} ${block.label} 起点`).toBeGreaterThanOrEqual(1);
      expect(block.to, `${preset.id} ${block.label} 终点`).toBeLessThanOrEqual(preset.rows.length);
      expect(block.to, `${preset.id} ${block.label} 终点`).toBeGreaterThanOrEqual(block.from);
    });
  }
}

describe("school-schedules", () => {
  it("所有内置预设都满足网格不变量", () => {
    for (const preset of listSchedulePresets()) expectValidPreset(preset);
  });

  it("未知或空的 scheduleId 回落到北大默认", () => {
    expect(getScheduleById(null)).toBe(DEFAULT_SCHEDULE);
    expect(getScheduleById("nope")).toBe(DEFAULT_SCHEDULE);
    expect(getScheduleById(PKU_SCHEDULE.id)).toBe(PKU_SCHEDULE);
    expect(getScheduleForSemester(undefined)).toBe(DEFAULT_SCHEDULE);
    expect(getScheduleForSemester({ scheduleId: null }).id).toBe("pku");
  });

  it("北大节次时间与旧 period-times 行为一致", () => {
    expect(periodRangeIn(PKU_SCHEDULE, 3, 4)).toEqual({ start: "10:10", end: "12:00" });
    expect(periodRangeMinutesIn(PKU_SCHEDULE, 1, 2)).toEqual({ startMin: 480, endMin: 590 });
    expect(periodRangeIn(PKU_SCHEDULE, 0, 2)).toBeNull();
    expect(periodRangeIn(PKU_SCHEDULE, 11, 13)).toBeNull();
  });
});
