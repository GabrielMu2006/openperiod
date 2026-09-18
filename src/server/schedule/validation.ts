import { z } from "zod";
import { WEEKDAYS } from "@/src/domain/schedule";

const weeksSchema = z.array(z.number().int().min(1).max(16)).min(1).max(16)
  .transform((weeks) => [...new Set(weeks)].sort((a, b) => a - b));

const meetingSchema = z.object({
  weekday: z.enum(WEEKDAYS),
  startPeriod: z.number().int().min(1).max(16),
  endPeriod: z.number().int().min(1).max(16),
  weeks: weeksSchema,
}).refine((meeting) => meeting.endPeriod >= meeting.startPeriod, {
  message: "结束节次不能早于开始节次",
  path: ["endPeriod"],
});

export const courseMutationSchema = z.object({
  name: z.string().trim().min(1).max(200),
  instructor: z.string().trim().max(120).optional(),
  location: z.string().trim().max(200).optional(),
  meetings: z.array(meetingSchema).min(1).max(64),
});

export const skipMutationSchema = z.object({
  week: z.number().int().min(1).max(16),
  skipped: z.boolean(),
});

// 批量「不去」：一次提交整学期的目标周次集合（替换式生效）
export const batchSkipSchema = z.object({
  weeks: z.array(z.number().int().min(1).max(16)).max(16)
    .transform((weeks) => [...new Set(weeks)].sort((a, b) => a - b)),
});

export const busyMutationSchema = z.object({
  kind: z.enum(["ONE_TIME", "RECURRING"]),
  title: z.string().trim().max(200).optional(),
  weekday: z.enum(WEEKDAYS),
  startPeriod: z.number().int().min(1).max(16),
  endPeriod: z.number().int().min(1).max(16),
  weeks: weeksSchema,
}).superRefine((block, context) => {
  if (block.endPeriod < block.startPeriod) {
    context.addIssue({ code: "custom", message: "结束节次不能早于开始节次", path: ["endPeriod"] });
  }
  if (block.kind === "ONE_TIME" && block.weeks.length !== 1) {
    context.addIssue({ code: "custom", message: "仅本周忙碌必须只包含一个教学周", path: ["weeks"] });
  }
});

export const scheduleQuerySchema = z.object({
  week: z.coerce.number().int().min(1).max(16).optional(),
});
