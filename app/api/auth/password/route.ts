import { changePasswordSchema } from "@/src/domain/auth";
import { changePassword } from "@/src/server/auth/credentials";
import { authErrorResponse, readAuthRequest } from "@/src/server/auth/request";
import { getCurrentUser, setSessionCookie } from "@/src/server/auth/session";
import { HttpError } from "@/src/server/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const input = await readAuthRequest(request, changePasswordSchema);
    const user = await getCurrentUser();
    if (!user) throw new HttpError(401, "请重新登录");
    const result = await changePassword(user.id, input.currentPassword, input.password);
    await setSessionCookie(result.session);
    return Response.json({ ok: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}
