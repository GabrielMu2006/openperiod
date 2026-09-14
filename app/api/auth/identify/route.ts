import { z } from "zod";
import { identifyUser, isPlaceholderNickname } from "@/src/server/auth/identity";
import { createSession } from "@/src/server/auth/session";
import { isEmailVerificationEnabled, issueEmailCode } from "@/src/server/auth/verification";
import { errorResponse } from "@/src/server/http";

export const runtime = "nodejs";

const identitySchema = z.object({
  email: z.email("请输入有效邮箱").trim().max(320),
});

export async function POST(request: Request) {
  try {
    const parsed = identitySchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json(
        { error: "身份信息无效", fields: z.flattenError(parsed.error).fieldErrors },
        { status: 400 },
      );
    }

    const user = await identifyUser(parsed.data.email);
    if (isEmailVerificationEnabled() && !user.emailVerifiedAt) {
      // 仅首次使用需要验证；已验证的邮箱直接建立会话
      await issueEmailCode(user.id, user.email);
      return Response.json({ verificationRequired: true, email: user.email });
    }

    await createSession(user.id);
    return Response.json({
      user,
      needsNickname: isPlaceholderNickname(user.nickname, user.email),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
