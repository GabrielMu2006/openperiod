import { z } from "zod";
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { getCurrentUser } from "@/src/server/auth/session";
import { getDatabase } from "@/src/server/db";
import { feedback } from "@/src/server/db/schema";
import { errorResponse } from "@/src/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 反馈回访（FB-02）：当前用户「已处理且未确认」的反馈，下次进站以横幅展示；
// 确认后写 acknowledged_at 不再显示。匿名反馈没有 user_id，无法回访。
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "未登录" }, { status: 401 });
    const items = await getDatabase()
      .select({
        id: feedback.id,
        content: feedback.content,
        reply: feedback.reply,
        handledAt: feedback.handledAt,
        createdAt: feedback.createdAt,
      })
      .from(feedback)
      .where(and(
        eq(feedback.userId, user.id),
        eq(feedback.handled, true),
        isNotNull(feedback.handledAt),
        isNull(feedback.acknowledgedAt),
      ))
      .orderBy(desc(feedback.handledAt))
      .limit(20);
    return Response.json({
      total: items.length,
      items: items.map((item) => ({
        ...item,
        handledAt: item.handledAt?.toISOString() ?? null,
        createdAt: item.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

const ackSchema = z.object({ id: z.string().uuid() });

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "未登录" }, { status: 401 });
    const parsed = ackSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "参数无效" }, { status: 400 });
    const [row] = await getDatabase()
      .update(feedback)
      .set({ acknowledgedAt: new Date() })
      .where(and(
        eq(feedback.id, parsed.data.id),
        eq(feedback.userId, user.id),
        eq(feedback.handled, true),
      ))
      .returning({ id: feedback.id });
    if (!row) return Response.json({ error: "反馈不存在或不属于当前用户" }, { status: 404 });
    return Response.json({ acknowledged: true });
  } catch (error) {
    return errorResponse(error);
  }
}
