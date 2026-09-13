import { getCurrentUser } from "@/src/server/auth/session";
import { errorResponse } from "@/src/server/http";
import { getMySchedule } from "@/src/server/schedule/data";
import { scheduleQuerySchema } from "@/src/server/schedule/validation";

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "未登录" }, { status: 401 });
    const parsed = scheduleQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) return Response.json({ error: "教学周无效" }, { status: 400 });
    return Response.json({ schedule: await getMySchedule(user.id, parsed.data.week) });
  } catch (error) {
    return errorResponse(error);
  }
}

