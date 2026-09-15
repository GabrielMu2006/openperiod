import { z } from "zod";
import { updateProfile } from "@/src/server/auth/identity";
import { getCurrentUser } from "@/src/server/auth/session";
import { getScheduleById } from "@/src/config/school-schedules";
import { errorResponse, HttpError } from "@/src/server/http";

export const runtime = "nodejs";

const profileSchema = z.object({
  nickname: z.string().trim().min(1, "请输入昵称").max(80, "昵称过长").optional(),
  defaultPrivacyLevel: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
  scheduleId: z.string().max(64).nullable().optional(),
});

export async function PUT(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "未登录" }, { status: 401 });

    const parsed = profileSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "资料信息无效" }, { status: 400 });
    if (parsed.data.scheduleId !== undefined && parsed.data.scheduleId !== null
      && getScheduleById(parsed.data.scheduleId).id !== parsed.data.scheduleId) {
      throw new HttpError(400, "未知的学校作息");
    }

    const updated = await updateProfile(user.id, parsed.data);
    return Response.json({ user: updated });
  } catch (error) {
    return errorResponse(error);
  }
}
