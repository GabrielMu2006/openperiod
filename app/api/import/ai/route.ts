import { randomUUID } from "node:crypto";
import { extractCoursesWithAi } from "@/src/server/importers/ai-extract";
import { createImportPreview } from "@/src/server/imports/data";
import { getCurrentUser } from "@/src/server/auth/session";
import { getScheduleById, toScheduleDTO, type ScheduleDTO, type SchedulePreset } from "@/src/config/school-schedules";
import type { ImportCourseDraft, ImportPreviewPayload, ImportWarning } from "@/src/domain/import";
import { errorResponse, HttpError } from "@/src/server/http";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_TEXT_LENGTH = 5000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const DAILY_LIMIT = 10;
const ALLOWED_IMAGE_TYPES = /^data:image\/(png|jpeg|webp);base64,/;

// 每用户每日次数上限（内存计数，按实例重置；对当前规模足够）
const usage = new Map<string, { date: string; count: number }>();

function assertWithinDailyLimit(userId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const entry = usage.get(userId);
  if (!entry || entry.date !== today) {
    usage.set(userId, { date: today, count: 1 });
    return;
  }
  if (entry.count >= DAILY_LIMIT) throw new HttpError(429, "今天的 AI 识别次数已用完（每天 10 次），明天再来");
  entry.count += 1;
}

function resolvePreset(scheduleId: string | null): SchedulePreset | ScheduleDTO {
  const preset = getScheduleById(scheduleId);
  if (scheduleId && preset.id !== scheduleId) throw new HttpError(400, "未知的学校作息");
  return preset;
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "未登录" }, { status: 401 });
    assertWithinDailyLimit(user.id);

    const body = (await request.json()) as { mode?: string; text?: string; image?: string };
    const mode = body.mode === "image" ? "image" : body.mode === "text" ? "text" : null;
    if (!mode) throw new HttpError(400, "请选择识别方式");

    if (mode === "text") {
      const text = String(body.text ?? "").trim();
      if (!text) throw new HttpError(400, "请先粘贴课表文字");
      if (text.length > MAX_TEXT_LENGTH) throw new HttpError(413, "粘贴的文字不能超过 5000 字");
      const preset = resolvePreset(user.scheduleId);
      const { courses, warnings } = await extractCoursesWithAi("text", text, preset);
      return Response.json({ preview: await buildPreview(user.id, preset, courses, warnings) }, { status: 201 });
    }

    const image = String(body.image ?? "");
    if (!ALLOWED_IMAGE_TYPES.test(image)) throw new HttpError(415, "请上传 PNG / JPG / WebP 截图");
    // data URL 的 base64 部分约占 4/3 体积，按原始字节校验
    if (image.length * 0.75 > MAX_IMAGE_BYTES) throw new HttpError(413, "截图不能超过 5MB");
    const preset = resolvePreset(user.scheduleId);
    const { courses, warnings } = await extractCoursesWithAi("image", image, preset);
    return Response.json({ preview: await buildPreview(user.id, preset, courses, warnings) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

async function buildPreview(userId: string, preset: SchedulePreset | ScheduleDTO, courses: ImportCourseDraft[], warnings: ImportWarning[]) {
  const payload: ImportPreviewPayload = {
    provider: "AI_EXTRACT",
    format: "ROW",
    courses,
    warnings: warnings.map((warning) => ({ ...warning, id: warning.id || randomUUID() })),
    stats: {
      courseCount: courses.length,
      meetingCount: courses.reduce((sum, course) => sum + course.meetings.length, 0),
      warningCount: warnings.length,
    },
    scheduleId: preset.id === "pku" ? undefined : preset.id,
    schedule: toScheduleDTO(preset),
  };
  return createImportPreview(userId, payload, preset.id);
}
