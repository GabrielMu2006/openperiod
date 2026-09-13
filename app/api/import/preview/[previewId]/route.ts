import { z } from "zod";
import { getImportPreview } from "@/src/server/imports/data";
import { getCurrentUser } from "@/src/server/auth/session";
import { errorResponse } from "@/src/server/http";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ previewId: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "未登录" }, { status: 401 });
    const { previewId } = await context.params;
    if (!z.uuid().safeParse(previewId).success) return Response.json({ error: "预览 ID 无效" }, { status: 400 });
    return Response.json({ preview: await getImportPreview(user.id, previewId) });
  } catch (error) {
    return errorResponse(error);
  }
}
