import { importConfirmationSchema } from "@/src/domain/import-validation";
import { confirmImport } from "@/src/server/imports/data";
import { getCurrentUser } from "@/src/server/auth/session";
import { errorResponse } from "@/src/server/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "未登录" }, { status: 401 });
    const parsed = importConfirmationSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "课表修正内容无效", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
    return Response.json({ imported: await confirmImport(user.id, parsed.data.previewId, parsed.data.courses) });
  } catch (error) {
    return errorResponse(error);
  }
}
