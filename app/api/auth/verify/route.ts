import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDatabase } from "@/src/server/db";
import { users } from "@/src/server/db/schema";
import { createSession } from "@/src/server/auth/session";
import { verifyEmailCode } from "@/src/server/auth/verification";
import { errorResponse } from "@/src/server/http";

export const runtime = "nodejs";

const verifySchema = z.object({
  email: z.email("请输入有效邮箱").trim().max(320),
  code: z.string().trim().regex(/^\d{6}$/, "验证码是 6 位数字"),
});

export async function POST(request: Request) {
  try {
    const parsed = verifySchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "请输入 6 位数字验证码" }, { status: 400 });

    const email = parsed.data.email.toLowerCase();
    const [user] = await getDatabase()
      .select({ id: users.id, nickname: users.nickname, email: users.email })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (!user) return Response.json({ error: "验证码不正确" }, { status: 400 });

    await verifyEmailCode(user.id, parsed.data.code);
    await createSession(user.id);
    return Response.json({ user });
  } catch (error) {
    return errorResponse(error);
  }
}
