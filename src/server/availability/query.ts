import { z } from "zod";
import { WEEKDAYS } from "@/src/domain/schedule";

const uuidList = z
  .string()
  .min(1)
  .transform((value) => [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))])
  .pipe(z.array(z.uuid()).min(1).max(100));

export const availabilityQuerySchema = z.object({
  week: z.coerce.number().int().min(1).max(16),
  users: uuidList,
});

export const availabilityDetailQuerySchema = availabilityQuerySchema.extend({
  weekday: z.enum(WEEKDAYS),
  period: z.coerce.number().int().min(1).max(12),
});

export function searchParamsToObject(searchParams: URLSearchParams) {
  return Object.fromEntries(searchParams.entries());
}
