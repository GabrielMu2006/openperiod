import { desc, eq } from "drizzle-orm";
import { getDatabase } from "@/src/server/db";
import { feedback, users } from "@/src/server/db/schema";
import { rejectUnlessAdmin } from "@/src/server/admin";
import { errorResponse, HttpError } from "@/src/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIST_LIMIT = 200;

export async function GET(request: Request) {
  const denied = await rejectUnlessAdmin(request);
  if (denied) return denied;

  try {
    const rows = await getDatabase()
.select({
        id: feedback.id,
        content: feedback.content,
        page: feedback.page,
        userAgent: feedback.userAgent,
        handled: feedback.handled,
        reply: feedback.reply,
        handledAt: feedback.handledAt,
        acknowledgedAt: feedback.acknowledgedAt,
        createdAt: feedback.createdAt,
        nickname: users.nickname,
        email: users.email,
      })
      .from(feedback)
      .leftJoin(users, eq(feedback.userId, users.id))
      .orderBy(desc(feedback.createdAt))
      .limit(LIST_LIMIT);

    return Response.json({
      total: rows.length,
      unhandled: rows.filter((row) => !row.handled).length,
      truncated: rows.length >= LIST_LIMIT,
      items: rows.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
        handledAt: row.handledAt?.toISOString() ?? null,
        acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  const denied = await rejectUnlessAdmin(request);
  if (denied) return denied;

  try {
    const parsed = (await request.json().catch(() => null)) as { id?: unknown; handled?: unknown; reply?: unknown } | null;
    const id = typeof parsed?.id === "string" ? parsed.id : "";
    if (!id || typeof parsed?.handled !== "boolean") throw new HttpError(400, "参数无效");
    // reply 仅在显式传入时更新（undefined = 保留原回复；空串 = 清空）
    const replyPatch = "reply" in (parsed ?? {})
      ? { reply: typeof parsed.reply === "string" && parsed.reply.trim() ? parsed.reply.trim().slice(0, 500) : null }
      : {};

    const [row] = await getDatabase()
      .update(feedback)
      .set({ handled: parsed.handled, handledAt: parsed.handled ? new Date() : null, ...replyPatch })
      .where(eq(feedback.id, id))
      .returning({ id: feedback.id, handled: feedback.handled, reply: feedback.reply, handledAt: feedback.handledAt });
    if (!row) throw new HttpError(404, "反馈不存在");
    return Response.json(row);
  } catch (error) {
    return errorResponse(error);
  }
}
