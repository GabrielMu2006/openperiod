import { z } from "zod";
import { restoreImportSnapshot } from "@/src/server/imports/data";
import { getCurrentUser } from "@/src/server/auth/session";
import { errorResponse } from "@/src/server/http";

export const runtime = "nodejs";

const restoreSchema = z.object({ snapshotId: z.uuid() });

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "未登录" }, { status: 401 });
    const parsed = restoreSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "恢复点 ID 无效" }, { status: 400 });
    return Response.json({ restored: await restoreImportSnapshot(user.id, parsed.data.snapshotId) });
  } catch (error) {
    return errorResponse(error);
  }
}
