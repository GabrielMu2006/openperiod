import { PkuExcelImporter } from "@/src/server/importers/pku-excel";
import { createImportPreview } from "@/src/server/imports/data";
import { getCurrentUser } from "@/src/server/auth/session";
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

    const buffer = await file.arrayBuffer();
    const detection = await importer.detect(buffer);
    if (!detection.supported) throw new HttpError(422, detection.reason);
    const payload = await importer.parse(buffer);
    return Response.json({ preview: await createImportPreview(user.id, payload) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
