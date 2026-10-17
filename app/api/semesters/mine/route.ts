import { z } from "zod";
import { getCurrentUser } from "@/src/server/auth/session";
import { errorResponse } from "@/src/server/http";
import {
  clearUserSemesterSetting,
  ensureDefaultSemester,
  getEffectiveUserSemester,
  getUserSemesterSetting,
  setUserSemesterSetting,
} from "@/src/server/semesters/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const putSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "开学日期格式应为 YYYY-MM-DD").refine((value) => {
    const parsed = new Date(`${value}T00:00:00+08:00`);
    return !Number.isNaN(parsed.getTime()) && parsed.getUTCFullYear() >= 2020 && parsed.getUTCFullYear() <= 2100;
  }, "开学日期应在 2020–2100 年之间"),
  weekCount: z.number().int().min(1).max(52),
});

// 用户级学期设置（USER-SEM）：开学日/周数覆盖学校默认，仅作用于当前默认学年/学期。
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "未登录" }, { status: 401 });
    const base = await ensureDefaultSemester(user.scheduleId);
    const override = await getUserSemesterSetting(user.id, base.academicYear, base.semester);
    const effective = await getEffectiveUserSemester(user.id, user.scheduleId);
    return Response.json({
      semester: { academicYear: base.academicYear, semester: base.semester, school: base.school },
      default: { startDate: base.startDate, weekCount: base.weekCount },
      override,
      effective: {
        startDate: effective.startDate,
        weekCount: effective.weekCount,
        currentWeek: effective.currentWeek,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "未登录" }, { status: 401 });
    const parsed = putSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "学期设置无效", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
    await setUserSemesterSetting(user.id, parsed.data);
    const effective = await getEffectiveUserSemester(user.id, user.scheduleId);
    return Response.json({ ok: true, effective: { startDate: effective.startDate, weekCount: effective.weekCount, currentWeek: effective.currentWeek } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE() {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "未登录" }, { status: 401 });
    await clearUserSemesterSetting(user.id);
    const base = await ensureDefaultSemester(user.scheduleId);
    return Response.json({ ok: true, effective: { startDate: base.startDate, weekCount: base.weekCount, currentWeek: base.currentWeek } });
  } catch (error) {
    return errorResponse(error);
  }
}
