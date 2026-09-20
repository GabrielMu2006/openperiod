import { z } from "zod";
import { getCurrentUser } from "@/src/server/auth/session";
import { leaveGroup, renameGroup, setGroupArchived } from "@/src/server/groups/data";
import { groupUpdateSchema } from "@/src/server/groups/validation";
import { errorResponse } from "@/src/server/http";

export const runtime = "nodejs";

const groupIdSchema = z.uuid();

export async function PATCH(
  request: Request,
  context: { params: Promise<{ groupId: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "未登录" }, { status: 401 });

    const { groupId } = await context.params;
    if (!groupIdSchema.safeParse(groupId).success) {
      return Response.json({ error: "群组 ID 无效" }, { status: 400 });
    }
    const parsed = groupUpdateSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "群组操作无效" }, { status: 400 });

    if (parsed.data.action === "rename") {
      return Response.json({ group: await renameGroup(user.id, groupId, parsed.data.name) });
    }
    return Response.json({
      group: await setGroupArchived(user.id, groupId, parsed.data.archived),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ groupId: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "未登录" }, { status: 401 });

    const { groupId } = await context.params;
    if (!groupIdSchema.safeParse(groupId).success) {
      return Response.json({ error: "群组 ID 无效" }, { status: 400 });
    }
    await leaveGroup(user.id, groupId);
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
