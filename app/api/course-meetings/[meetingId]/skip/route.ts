import { getCurrentUser } from "@/src/server/auth/session";
import { errorResponse } from "@/src/server/http";
import { setMeetingSkipped } from "@/src/server/schedule/data";
import { skipMutationSchema } from "@/src/server/schedule/validation";

export async function PUT(request: Request, context: { params: Promise<{ meetingId: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "未登录" }, { status: 401 });
    const { meetingId } = await context.params;
    if (!z.uuid().safeParse(meetingId).success) return Response.json({ error: "课程时段 ID 无效" }, { status: 400 });
    const parsed = skipMutationSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "本周状态无效" }, { status: 400 });
    await setMeetingSkipped(user.id, meetingId, parsed.data.week, parsed.data.skipped);
    return Response.json({ skipped: parsed.data.skipped });
  } catch (error) {
    return errorResponse(error);
  }
}
import { z } from "zod";
