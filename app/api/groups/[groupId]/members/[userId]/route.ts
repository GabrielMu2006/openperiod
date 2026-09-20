import { z } from "zod";
import { getCurrentUser } from "@/src/server/auth/session";
import { removeGroupMember, transferGroupOwnership } from "@/src/server/groups/data";
import { transferOwnershipSchema } from "@/src/server/groups/validation";
import { errorResponse } from "@/src/server/http";

export const runtime = "nodejs";

const idSchema = z.uuid();

export async function PATCH(
  request: Request,
  context: { params: Promise<{ groupId: string; userId: string }> },
) {
  try {
    const owner = await getCurrentUser();
    if (!owner) return Response.json({ error: "未登录" }, { status: 401 });

    const { groupId, userId } = await context.params;
    if (!idSchema.safeParse(groupId).success || !idSchema.safeParse(userId).success) {
      return Response.json({ error: "群组或成员 ID 无效" }, { status: 400 });
    }
    const parsed = transferOwnershipSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "成员操作无效" }, { status: 400 });

    await transferGroupOwnership(owner.id, groupId, userId);
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ groupId: string; userId: string }> },
) {
  try {
    const owner = await getCurrentUser();
    if (!owner) return Response.json({ error: "未登录" }, { status: 401 });

    const { groupId, userId } = await context.params;
    if (!idSchema.safeParse(groupId).success || !idSchema.safeParse(userId).success) {
      return Response.json({ error: "群组或成员 ID 无效" }, { status: 400 });
    }
    await removeGroupMember(owner.id, groupId, userId);
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
