import { z } from "zod";
import { regenerateInviteCode } from "@/src/server/groups/data";
import { getCurrentUser } from "@/src/server/auth/session";
import { errorResponse } from "@/src/server/http";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ groupId: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "未登录" }, { status: 401 });
    const { groupId } = await context.params;
    if (!z.uuid().safeParse(groupId).success) return Response.json({ error: "群组 ID 无效" }, { status: 400 });

    return Response.json({ inviteCode: await regenerateInviteCode(user.id, groupId) });
  } catch (error) {
    return errorResponse(error);
  }
}
