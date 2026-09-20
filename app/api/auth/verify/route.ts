import { completeChallengeSchema } from "@/src/domain/auth";
import { completePasswordChallenge } from "@/src/server/auth/credentials";
import { authErrorResponse, readAuthRequest } from "@/src/server/auth/request";
import { setSessionCookie } from "@/src/server/auth/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const input = await readAuthRequest(request, completeChallengeSchema);
    const result = await completePasswordChallenge(input);
    await setSessionCookie(result.session);
    return Response.json({ user: result.user, needsNickname: result.needsNickname });
  } catch (error) {
    return authErrorResponse(error);
  }
}
