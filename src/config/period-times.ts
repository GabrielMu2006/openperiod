// 北大预设的兼容快捷方式。新代码请改用 school-schedules 的 schedule 版本
// （periodRangeIn / periodRangeMinutesIn），只有默认单校场景才继续用这里的导出。
import { PKU_SCHEDULE, periodRangeIn, periodRangeMinutesIn } from "./school-schedules";

export const PERIOD_TIMES: readonly { start: string; end: string }[] = PKU_SCHEDULE.rows;
export const PERIOD_COUNT = PERIOD_TIMES.length;

// 连续节次的实际起止时间；节次越界时返回 null
export function periodRange(startPeriod: number, endPeriod: number): { start: string; end: string } | null {
  return periodRangeIn(PKU_SCHEDULE, startPeriod, endPeriod);
}

export function periodRangeMinutes(startPeriod: number, endPeriod: number): { startMin: number; endMin: number } | null {
  return periodRangeMinutesIn(PKU_SCHEDULE, startPeriod, endPeriod);
}
