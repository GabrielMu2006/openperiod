import { z } from "zod";
import { WEEKDAYS } from "./schedule";

const meetingDraftSchema = z.object({
  id: z.string().min(1).max(80),
  weekday: z.enum(WEEKDAYS),
  startPeriod: z.number().int().min(1).max(16),
  endPeriod: z.number().int().min(1).max(16),
  weeks: z.array(z.number().int().min(1).max(16)).min(1).max(16),
  source: z.string().max(200),
}).refine((meeting) => meeting.endPeriod >= meeting.startPeriod, {
  message: "结束节次不能早于开始节次",
  path: ["endPeriod"],
});

export const courseDraftSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().trim().min(1).max(200),
  instructor: z.string().trim().max(120).optional(),
  location: z.string().trim().max(200).optional(),
  meetings: z.array(meetingDraftSchema).min(1).max(64),
});

export const importConfirmationSchema = z.object({
  previewId: z.uuid(),
  courses: z.array(courseDraftSchema).min(1).max(200),
});
