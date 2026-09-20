import { randomUUID } from "node:crypto";
import { assertAiExtractionConfigured, extractCoursesWithAi } from "@/src/server/importers/ai-extract";
import { consumeAiImportAttempt } from "@/src/server/importers/ai-quota";
import { createImportPreview } from "@/src/server/imports/data";
import { getCurrentUser } from "@/src/server/auth/session";
import { getScheduleById, toScheduleDTO, validateCustomRows, type ScheduleDTO, type SchedulePreset } from "@/src/config/school-schedules";
import type { ImportCourseDraft, ImportPreviewPayload, ImportWarning } from "@/src/domain/import";
import { errorResponse, HttpError } from "@/src/server/http";
import { ensureDefaultSemester } from "@/src/server/semesters/data";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_TEXT_LENGTH = 5000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = /^data:image\/(png|jpeg|webp);base64,/;

type CustomRow = { start: string; end: string };

function isCustomRow(value: unknown): value is CustomRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.start === "string" && typeof row.end === "string";
}

function resolveImportSchedule(scheduleIdInput: unknown, customRowsInput: unknown): {
  preset: SchedulePreset | ScheduleDTO;
  customRows?: CustomRow[];
} {
  const scheduleId = typeof scheduleIdInput === "string" ? scheduleIdInput.trim() : "";
  if (!scheduleId) throw new HttpError(400, "请选择学校作息");

  if (scheduleId === "custom") {
    if (!Array.isArray(customRowsInput) || !customRowsInput.every(isCustomRow)) {
      throw new HttpError(400, "自定义作息格式无效");
    }
    const customRows = customRowsInput.map((row) => ({ start: row.start.trim(), end: row.end.trim() }));
    const verdict = validateCustomRows(customRows);
    if (!verdict.ok) throw new HttpError(400, verdict.message ?? "自定义作息无效");
    return {
      customRows,
      preset: {
        id: "custom",
        school: "自定义作息",
        kind: "period",
        rows: customRows.map((row, index) => ({ period: index + 1, start: row.start, end: row.end })),
      },
    };
  }

  const preset = getScheduleById(scheduleId);
  if (preset.id !== scheduleId) throw new HttpError(400, "未知的学校作息");
  return { preset };
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "未登录" }, { status: 401 });

    const body = (await request.json()) as { mode?: string; text?: string; image?: string; scheduleId?: unknown; customRows?: unknown };
    const mode = body.mode === "image" ? "image" : body.mode === "text" ? "text" : null;
    if (!mode) throw new HttpError(400, "请选择识别方式");
    const { preset, customRows } = resolveImportSchedule(body.scheduleId, body.customRows);

    let content: string;
    if (mode === "text") {
      const text = String(body.text ?? "").trim();
      if (!text) throw new HttpError(400, "请先粘贴课表文字");
      if (text.length > MAX_TEXT_LENGTH) throw new HttpError(413, "粘贴的文字不能超过 5000 字");
      content = text;
    } else {
      const image = String(body.image ?? "");
      if (!ALLOWED_IMAGE_TYPES.test(image)) throw new HttpError(415, "请上传 PNG / JPG / WebP 截图");
      // data URL 的 base64 部分约占 4/3 体积，按原始字节校验
      if (image.length * 0.75 > MAX_IMAGE_BYTES) throw new HttpError(413, "截图不能超过 5MB");
      content = image;
    }

    assertAiExtractionConfigured();
    const semester = await ensureDefaultSemester(preset.id);
    await consumeAiImportAttempt(user.id);
    const { courses, warnings } = await extractCoursesWithAi(mode, content, preset, semester.weekCount);
    return Response.json({ preview: await buildPreview(user.id, preset, semester.weekCount, courses, warnings, customRows) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

async function buildPreview(
  userId: string,
  preset: SchedulePreset | ScheduleDTO,
  weekCount: number,
  courses: ImportCourseDraft[],
  warnings: ImportWarning[],
  customRows?: CustomRow[],
) {
  const payload: ImportPreviewPayload = {
    provider: "AI_EXTRACT",
    format: "ROW",
    weekCount,
    courses,
    warnings: warnings.map((warning) => ({ ...warning, id: warning.id || randomUUID() })),
    stats: {
      courseCount: courses.length,
      meetingCount: courses.reduce((sum, course) => sum + course.meetings.length, 0),
      warningCount: warnings.length,
    },
    scheduleId: preset.id === "pku" ? undefined : preset.id,
    schedule: toScheduleDTO(preset),
    ...(customRows ? { customRows } : {}),
  };
  return createImportPreview(userId, payload, preset.id);
}
