import { WEEKDAYS, type Weekday } from "./schedule";
import type { MinuteInterval } from "./free-intervals";

export interface FreeRun {
  weekday: Weekday;
  startMin: number;
  endMin: number;
}

// 服务端已在钟点轴上算出「全员空闲」的分钟区间；这里只把「已完全过去」的
// 区间从今天排除。isExcluded 以区间整体判断，正在进行的区间仍会完整保留。
export function buildFreeRuns(
  freeIntervals: Record<Weekday, MinuteInterval[]>,
  isExcluded?: (weekday: Weekday, run: MinuteInterval) => boolean,
): FreeRun[] {
  const runs: FreeRun[] = [];
  for (const weekday of WEEKDAYS) {
    for (const interval of freeIntervals[weekday] ?? []) {
      if (interval.endMin <= interval.startMin) continue;
      if (isExcluded?.(weekday, interval)) continue;
      runs.push({ weekday, startMin: interval.startMin, endMin: interval.endMin });
    }
  }
  return runs;
}

export function formatDuration(minutes: number): string {
  if (minutes <= 0) return "0 分钟";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} 分钟`;
  if (rest === 0) return `${hours} 小时`;
  return `${hours} 小时 ${rest} 分`;
}

export function formatClock(minutes: number): string {
  const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}
