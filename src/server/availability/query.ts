import { z } from "zod";
import { MAX_PERIOD_COUNT } from "@/src/config/school-schedules";
import { WEEKDAYS } from "@/src/domain/schedule";

// 学期周数的静态硬上限；目标群组学期的实际周数校验在数据层进行（SCH-02）
const WEEK_CAP = 52;
const DISPLAY_GRID_MAX_ROWS = MAX_PERIOD_COUNT + 4;

const uuidList = z
  .string()
  .min(1)
  .transform((value) => [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))])
  .pipe(z.array(z.uuid()).min(1).max(100));

export const availabilityQuerySchema = z.object({
  week: z.coerce.number().int().min(1).max(WEEK_CAP),
  users: uuidList,
});

export const availabilityDetailQuerySchema = availabilityQuerySchema.extend({
  weekday: z.enum(WEEKDAYS),
  period: z.coerce.number().int().min(1).max(DISPLAY_GRID_MAX_ROWS),
});

export function searchParamsToObject(searchParams: URLSearchParams) {
  return Object.fromEntries(searchParams.entries());
}
