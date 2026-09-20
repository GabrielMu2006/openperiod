import { getCurrentUser } from "@/src/server/auth/session";
import { errorResponse } from "@/src/server/http";
import { setSemesterConfirmedEmpty } from "@/src/server/schedule/data";
import { confirmEmptySchema } from "@/src/server/schedule/validation";

export async function PUT(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "未登录" }, { status: 401 });
    const parsed = confirmEmptySchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "参数无效" }, { status: 400 });
    return Response.json(await setSemesterConfirmedEmpty(user.id, parsed.data.confirmed));
  } catch (error) {
    return errorResponse(error);
  }
}
