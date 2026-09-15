// 学校作息预设：把「第 N 节」翻译成钟点时间的唯一来源。
// 新增学校 = 在 SCHEDULE_PRESETS 里加一个预设，网格行数、导入解析、时间显示都会自动跟随。
// 不变量：rows 按 period 1..N 连续排列、时间单调递增且互不重叠、N ≤ MAX_PERIOD_COUNT。

export type ScheduleRow = {
  period: number;
  start: string;
  end: string;
  /** 网格行显示名（大节制学校的小节行没有独立名字时可省略） */
  label?: string;
};

/** 大节 → 小节区间（from/to 均含）。仅大节制（kind="block"）学校需要。 */
export type ScheduleBlock = {
  label: string;
  from: number;
  to: number;
};

export type SchedulePreset = {
  id: string;
  /** 展示名，如「北京大学」 */
  school: string;
  /** 变体说明（校区 / 冬夏令时），如「江安校区」「夏季作息」 */
  variant?: string;
  /** period: 课表以小节号排课；block: 课表以大节号排课（导入时经 blocks 展开） */
  kind: "period" | "block";
  rows: ScheduleRow[];
  blocks?: ScheduleBlock[];
};

export const MAX_PERIOD_COUNT = 16;

export const PKU_SCHEDULE: SchedulePreset = {
  id: "pku",
  school: "北京大学",
  kind: "period",
  rows: [
    { period: 1, start: "08:00", end: "08:50" },
    { period: 2, start: "09:00", end: "09:50" },
    { period: 3, start: "10:10", end: "11:00" },
    { period: 4, start: "11:10", end: "12:00" },
    { period: 5, start: "13:00", end: "13:50" },
    { period: 6, start: "14:00", end: "14:50" },
    { period: 7, start: "15:10", end: "16:00" },
    { period: 8, start: "16:10", end: "17:00" },
    { period: 9, start: "17:10", end: "18:00" },
    { period: 10, start: "18:40", end: "19:30" },
    { period: 11, start: "19:40", end: "20:30" },
    { period: 12, start: "20:40", end: "21:30" },
  ],
};

const PRESETS: Record<string, SchedulePreset> = {
  [PKU_SCHEDULE.id]: PKU_SCHEDULE,
};

/** 未选择学校时的回落预设（= 北大） */
export const DEFAULT_SCHEDULE = PKU_SCHEDULE;

/** 全部预设，供导入页学校选择器使用（按 school 名排序展示） */
export function listSchedulePresets(): SchedulePreset[] {
  return Object.values(PRESETS).sort((a, b) => a.school.localeCompare(b.school, "zh-Hans-CN"));
}

/** scheduleId 为空或未知时回落到北大默认，保证存量用户与旧数据零感知 */
export function getScheduleById(scheduleId?: string | null): SchedulePreset {
  if (!scheduleId) return PKU_SCHEDULE;
  return PRESETS[scheduleId] ?? PKU_SCHEDULE;
}

export function getScheduleForSemester(semester?: { scheduleId?: string | null } | null): SchedulePreset {
  return getScheduleById(semester?.scheduleId);
}

export function schedulePeriodCount(schedule: SchedulePreset): number {
  return schedule.rows.length;
}

function toMinutes(hhmm: string) {
  const [hours, minutes] = hhmm.split(":").map(Number);
  return hours * 60 + minutes;
}

/** 连续节次的实际起止时间；节次越界时返回 null */
export function periodRangeIn(schedule: SchedulePreset, startPeriod: number, endPeriod: number): { start: string; end: string } | null {
  const first = schedule.rows[startPeriod - 1];
  const last = schedule.rows[endPeriod - 1];
  if (!first || !last) return null;
  return { start: first.start, end: last.end };
}

export function periodRangeMinutesIn(schedule: SchedulePreset, startPeriod: number, endPeriod: number): { startMin: number; endMin: number } | null {
  const range = periodRangeIn(schedule, startPeriod, endPeriod);
  if (!range) return null;
  return { startMin: toMinutes(range.start), endMin: toMinutes(range.end) };
}
