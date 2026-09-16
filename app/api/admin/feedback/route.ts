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
    const parsed = (await request.json().catch(() => null)) as { id?: unknown; handled?: unknown } | null;
    const id = typeof parsed?.id === "string" ? parsed.id : "";
    if (!id || typeof parsed?.handled !== "boolean") throw new HttpError(400, "参数无效");

    const [row] = await getDatabase()
      .update(feedback)
      .set({ handled: parsed.handled })
      .where(eq(feedback.id, id))
      .returning({ id: feedback.id, handled: feedback.handled });
    if (!row) throw new HttpError(404, "反馈不存在");
    return Response.json(row);
  } catch (error) {
    return errorResponse(error);
  }
}
