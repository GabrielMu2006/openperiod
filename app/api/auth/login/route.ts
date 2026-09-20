import { loginSchema } from "@/src/domain/auth";
import { loginWithPassword } from "@/src/server/auth/credentials";
import { authErrorResponse, readAuthRequest } from "@/src/server/auth/request";
import { setSessionCookie } from "@/src/server/auth/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { email, password } = await readAuthRequest(request, loginSchema);
    const result = await loginWithPassword(email, password);
    await setSessionCookie(result.session);
    return Response.json({ user: result.user, needsNickname: result.needsNickname });
  } catch (error) {
    return authErrorResponse(error);
  }
}
