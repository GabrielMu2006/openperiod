import { createGroup, listGroupsForUser } from "@/src/server/groups/data";
import { createGroupSchema } from "@/src/server/groups/validation";
import { getCurrentUser } from "@/src/server/auth/session";
import { errorResponse } from "@/src/server/http";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "未登录" }, { status: 401 });
    return Response.json({ groups: await listGroupsForUser(user.id) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "未登录" }, { status: 401 });

    const parsed = createGroupSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "群组信息无效" }, { status: 400 });

    const group = await createGroup(user.id, parsed.data.name, parsed.data.privacyLevel);
    return Response.json({ group }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
