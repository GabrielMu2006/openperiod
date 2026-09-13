import { z } from "zod";
import { identifyUser } from "@/src/server/auth/identity";
import { createSession } from "@/src/server/auth/session";
import { errorResponse } from "@/src/server/http";

export const runtime = "nodejs";

const identitySchema = z.object({
  nickname: z.string().trim().min(1, "请输入昵称").max(80, "昵称过长"),
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

    const user = await identifyUser(parsed.data);
    await createSession(user.id);
    return Response.json({ user }, { status: 200 });
  } catch (error) {
    return errorResponse(error);
  }
}
