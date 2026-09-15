import { PERIOD_COUNT } from "@/src/config/period-times";
import { WEEKDAYS, type Weekday } from "./schedule";

export interface SlotInfo {
  commonFree: boolean;
  freeCount: number;
  selectedUsers: number;
}

export type SlotGrid = Record<Weekday, Record<string, SlotInfo>>;

export interface FreeRun {
  weekday: Weekday;
  startPeriod: number;
  endPeriod: number;
}

// 把每周每节的「全员有空」格子折算成一天内的连续空档；
// isExcluded 用于把已经过去的时段排除在今天之外。
// periodCount 跟随所在学校的作息预设（缺省 = 北大 12 节）。
export function buildFreeRuns(
  slots: SlotGrid,
  isExcluded?: (weekday: Weekday, period: number) => boolean,
  periodCount: number = PERIOD_COUNT,
): FreeRun[] {
  const runs: FreeRun[] = [];
  for (const weekday of WEEKDAYS) {
    let start: number | null = null;
    for (let period = 1; period <= periodCount + 1; period += 1) {
      const info = period <= periodCount ? slots[weekday]?.[String(period)] : undefined;
      const free = Boolean(info?.commonFree) && !(isExcluded?.(weekday, period) ?? false);
      if (free && start === null) {
        start = period;
      } else if (!free && start !== null) {
        runs.push({ weekday, startPeriod: start, endPeriod: period - 1 });
        start = null;
      }
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
