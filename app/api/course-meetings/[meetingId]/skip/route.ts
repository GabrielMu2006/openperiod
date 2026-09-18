import { z } from "zod";
import { getCurrentUser } from "@/src/server/auth/session";
import { errorResponse } from "@/src/server/http";
import { replaceMeetingSkips, setMeetingSkipped } from "@/src/server/schedule/data";
import { batchSkipSchema, skipMutationSchema } from "@/src/server/schedule/validation";

export async function PUT(request: Request, context: { params: Promise<{ meetingId: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "未登录" }, { status: 401 });
    const { meetingId } = await context.params;
    if (!z.uuid().safeParse(meetingId).success) return Response.json({ error: "课程时段 ID 无效" }, { status: 400 });
    const body = await request.json();
    // 两种形态：{ week, skipped } 单周切换；{ weeks } 批量替换整学期的「不去」集合
    const single = skipMutationSchema.safeParse(body);
    if (single.success) {
      await setMeetingSkipped(user.id, meetingId, single.data.week, single.data.skipped);
      return Response.json({ skipped: single.data.skipped });
    }
    const batch = batchSkipSchema.safeParse(body);
    if (!batch.success) return Response.json({ error: "周次参数无效" }, { status: 400 });
    await replaceMeetingSkips(user.id, meetingId, batch.data.weeks);
    return Response.json({ weeks: batch.data.weeks });
  } catch (error) {
    return errorResponse(error);
  }
}
