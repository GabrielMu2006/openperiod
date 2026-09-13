import { deleteCurrentSession, getCurrentUser } from "@/src/server/auth/session";
import { errorResponse } from "@/src/server/http";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await getCurrentUser();
    return user
      ? Response.json({ user })
      : Response.json({ error: "未登录" }, { status: 401 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE() {
  try {
    await deleteCurrentSession();
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
