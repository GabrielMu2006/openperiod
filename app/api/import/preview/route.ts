import { PkuExcelImporter } from "@/src/server/importers/pku-excel";
import { createImportPreview } from "@/src/server/imports/data";
import { getCurrentUser } from "@/src/server/auth/session";
import { getScheduleById, toScheduleDTO, validateCustomRows, type ScheduleDTO, type SchedulePreset } from "@/src/config/school-schedules";
import { ensureCustomSemester } from "@/src/server/semesters/data";
import { errorResponse, HttpError } from "@/src/server/http";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const importer = new PkuExcelImporter();

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "未登录" }, { status: 401 });

    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > MAX_FILE_SIZE + 128 * 1024) throw new HttpError(413, "Excel 文件不能超过 5MB");
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "请选择 Excel 文件");
    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith(".xlsx") && !fileName.endsWith(".xls")) throw new HttpError(415, "当前支持 .xlsx / .xls 文件");
    if (file.size > MAX_FILE_SIZE) throw new HttpError(413, "Excel 文件不能超过 5MB");

    // 学校作息预设：未知 id 一律拒绝，缺省走北大默认；"custom" 走自定义作息
    const rawScheduleId = form.get("scheduleId");
    const scheduleId = typeof rawScheduleId === "string" && rawScheduleId ? rawScheduleId : null;
    let preset: SchedulePreset | ScheduleDTO;
    if (scheduleId === "custom") {
      const rawRows = form.get("customRows");
      let rows: { start: string; end: string }[] = [];
      try {
        rows = typeof rawRows === "string" && rawRows ? (JSON.parse(rawRows) as { start: string; end: string }[]) : [];
      } catch {
        throw new HttpError(400, "自定义作息格式无效");
      }
      const verdict = validateCustomRows(rows);
      if (!verdict.ok) throw new HttpError(400, verdict.message ?? "自定义作息无效");
      const semester = await ensureCustomSemester(rows);
      preset = {
        id: "custom",
        school: "自定义作息",
        kind: "period",
        rows: rows.map((row, index) => ({ period: index + 1, start: row.start, end: row.end })),
      };
    } else {
      if (scheduleId && getScheduleById(scheduleId).id !== scheduleId) throw new HttpError(400, "未知的学校作息");
      preset = getScheduleById(scheduleId);
    }

    const buffer = await file.arrayBuffer();
    const detection = await importer.detect(buffer, preset);
    if (!detection.supported) throw new HttpError(422, detection.reason);
    const payload = await importer.parse(buffer, preset);
    payload.scheduleId = preset.id === "pku" ? undefined : preset.id;
    // 作息快照随预览存储/下发，前端网格无需查注册表
    payload.schedule = toScheduleDTO(preset);
    return Response.json({ preview: await createImportPreview(user.id, payload, preset.id) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
