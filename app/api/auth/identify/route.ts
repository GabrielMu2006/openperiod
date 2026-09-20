import { challengeSchema } from "@/src/domain/auth";
import { requestPasswordChallenge } from "@/src/server/auth/credentials";
import { authErrorResponse, readAuthRequest } from "@/src/server/auth/request";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { email, purpose } = await readAuthRequest(request, challengeSchema);
    return Response.json(await requestPasswordChallenge(email, purpose));
  } catch (error) {
    return authErrorResponse(error);
  }
}
