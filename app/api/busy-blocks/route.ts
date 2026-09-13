import { getCurrentUser } from "@/src/server/auth/session";
import { errorResponse } from "@/src/server/http";
import { createBusyBlock } from "@/src/server/schedule/data";
import { busyMutationSchema } from "@/src/server/schedule/validation";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "未登录" }, { status: 401 });
    const parsed = busyMutationSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "忙碌时段内容无效", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
    return Response.json({ busyBlock: await createBusyBlock(user.id, parsed.data) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

