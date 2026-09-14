// 学校作息时间（北京大学校本部，12 节制）。学校调整作息时改这里即可。
export const PERIOD_TIMES: readonly { start: string; end: string }[] = [
  { start: "08:00", end: "08:50" }, // 第 1 节
  { start: "09:00", end: "09:50" }, // 第 2 节
  { start: "10:10", end: "11:00" }, // 第 3 节
  { start: "11:10", end: "12:00" }, // 第 4 节
  { start: "13:00", end: "13:50" }, // 第 5 节
  { start: "14:00", end: "14:50" }, // 第 6 节
  { start: "15:10", end: "16:00" }, // 第 7 节
  { start: "16:10", end: "17:00" }, // 第 8 节
  { start: "17:10", end: "18:00" }, // 第 9 节
  { start: "18:40", end: "19:30" }, // 第 10 节
  { start: "19:40", end: "20:30" }, // 第 11 节
  { start: "20:40", end: "21:30" }, // 第 12 节
];

export const PERIOD_COUNT = PERIOD_TIMES.length;

function toMinutes(hhmm: string) {
  const [hours, minutes] = hhmm.split(":").map(Number);
  return hours * 60 + minutes;
}

// 连续节次的实际起止时间；节次越界时返回 null
export function periodRange(startPeriod: number, endPeriod: number): { start: string; end: string } | null {
  const first = PERIOD_TIMES[startPeriod - 1];
  const last = PERIOD_TIMES[endPeriod - 1];
  if (!first || !last) return null;
  return { start: first.start, end: last.end };
}

export function periodRangeMinutes(startPeriod: number, endPeriod: number): { startMin: number; endMin: number } | null {
  const range = periodRange(startPeriod, endPeriod);
  if (!range) return null;
  return { startMin: toMinutes(range.start), endMin: toMinutes(range.end) };
}
