import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDatabase } from "@/src/server/db";
import { users } from "@/src/server/db/schema";
import { issueEmailCode } from "@/src/server/auth/verification";
import { errorResponse, HttpError } from "@/src/server/http";

export const runtime = "nodejs";

const resendSchema = z.object({
  email: z.email("请输入有效邮箱").trim().max(320),
});

export async function POST(request: Request) {
  try {
    const parsed = resendSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "请输入有效邮箱" }, { status: 400 });

    const email = parsed.data.email.toLowerCase();
    const [user] = await getDatabase()
      .select({ id: users.id, email: users.email, emailVerifiedAt: users.emailVerifiedAt })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (!user) throw new HttpError(404, "请先回到上一步填写昵称和邮箱");
    if (user.emailVerifiedAt) throw new HttpError(400, "该邮箱已验证过，直接登录即可");

    await issueEmailCode(user.id, user.email);
    return Response.json({ verificationRequired: true });
  } catch (error) {
    return errorResponse(error);
  }
}
