import { z } from "zod";
import { getCurrentUser } from "@/src/server/auth/session";
import { errorResponse } from "@/src/server/http";
import { deleteBusyBlock, updateBusyBlock } from "@/src/server/schedule/data";
import { busyMutationSchema } from "@/src/server/schedule/validation";

export async function PUT(request: Request, context: { params: Promise<{ busyId: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "未登录" }, { status: 401 });
    const { busyId } = await context.params;
    if (!z.uuid().safeParse(busyId).success) return Response.json({ error: "忙碌时段 ID 无效" }, { status: 400 });
    const parsed = busyMutationSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "忙碌时段内容无效", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
    await updateBusyBlock(user.id, busyId, parsed.data);
    return Response.json({ updated: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ busyId: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "未登录" }, { status: 401 });
    const { busyId } = await context.params;
    if (!z.uuid().safeParse(busyId).success) return Response.json({ error: "忙碌时段 ID 无效" }, { status: 400 });
    await deleteBusyBlock(user.id, busyId);
    return Response.json({ deleted: true });
  } catch (error) {
    return errorResponse(error);
  }
}
