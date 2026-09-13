import { z } from "zod";
import { updateGroupPrivacy } from "@/src/server/groups/data";
import { privacySchema } from "@/src/server/groups/validation";
import { getCurrentUser } from "@/src/server/auth/session";
import { errorResponse } from "@/src/server/http";

export const runtime = "nodejs";

export async function PUT(
  request: Request,
  context: { params: Promise<{ groupId: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "未登录" }, { status: 401 });
    const { groupId } = await context.params;
    if (!z.uuid().safeParse(groupId).success) return Response.json({ error: "群组 ID 无效" }, { status: 400 });

    const parsed = privacySchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "隐私设置无效" }, { status: 400 });
    await updateGroupPrivacy(user.id, groupId, parsed.data.privacyLevel);
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
