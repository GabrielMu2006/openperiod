import { z } from "zod";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/src/server/auth/session";
import { errorResponse } from "@/src/server/http";
import { getDatabase } from "@/src/server/db";
import { users } from "@/src/server/db/schema";
import { validateCustomRows } from "@/src/config/school-schedules";
import { ensureDefaultSemester, saveUserCustomSchedule } from "@/src/server/semesters/data";

export const runtime = "nodejs";

const bodySchema = z.object({
  rows: z.array(z.object({ start: z.string(), end: z.string() })).min(1).max(16),
});

// 「其他学校」手动流程（SCH-01）：只保存作息时间表（每节开始/结束时间）并把用户切到
// custom 网格；课表内容由用户在「我的课表」手动添加。不触碰任何已有课程数据。
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "未登录" }, { status: 401 });
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "作息时间表格式无效" }, { status: 400 });
    const rows = parsed.data.rows.map((row) => ({ start: row.start.trim(), end: row.end.trim() }));
    const verdict = validateCustomRows(rows);
    if (!verdict.ok) return Response.json({ error: verdict.message }, { status: 400 });
    await ensureDefaultSemester("custom");
    await saveUserCustomSchedule(user.id, rows);
    await getDatabase()
      .update(users)
      .set({ scheduleId: "custom", updatedAt: new Date() })
      .where(eq(users.id, user.id));
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
