import { joinGroup } from "@/src/server/groups/data";
import { joinGroupSchema } from "@/src/server/groups/validation";
import { getCurrentUser } from "@/src/server/auth/session";
import { errorResponse } from "@/src/server/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "未登录" }, { status: 401 });

    const parsed = joinGroupSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "邀请码格式无效" }, { status: 400 });

    return Response.json({
      group: await joinGroup(user.id, parsed.data.code, parsed.data.privacyLevel),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
