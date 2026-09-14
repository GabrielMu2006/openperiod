import "server-only";
import { and, eq } from "drizzle-orm";
import { DEFAULT_SEMESTER, getTeachingWeek } from "@/src/config/semester";
import { getDatabase } from "@/src/server/db";
import { semesters } from "@/src/server/db/schema";

// 读路径专用：学期存在就原样返回，不存在才按默认配置创建，绝不覆盖已有配置。
// 修改开学日/周数请走 applySemesterConfig（独立维护流程），不要在这里加更新逻辑。
export async function ensureDefaultSemester() {
  const database = getDatabase();
  const [existing] = await database
    .select()
    .from(semesters)
    .where(and(
      eq(semesters.school, DEFAULT_SEMESTER.school),
      eq(semesters.academicYear, DEFAULT_SEMESTER.academicYear),
      eq(semesters.semester, DEFAULT_SEMESTER.semester),
    ))
    .limit(1);

  const semester = existing ?? (await createDefaultSemester(database));
  return {
    ...semester,
    currentWeek: getTeachingWeek(semester),
  };
}

async function createDefaultSemester(database: ReturnType<typeof getDatabase>) {
  const [created] = await database
    .insert(semesters)
    .values({
      school: DEFAULT_SEMESTER.school,
      academicYear: DEFAULT_SEMESTER.academicYear,
      semester: DEFAULT_SEMESTER.semester,
      startDate: DEFAULT_SEMESTER.startDate,
      weekCount: DEFAULT_SEMESTER.weekCount,
      timezone: DEFAULT_SEMESTER.timezone,
    })
    .onConflictDoNothing({
      target: [semesters.school, semesters.academicYear, semesters.semester],
    })
    .returning();

  if (created) return created;

  const [semester] = await database
    .select()
    .from(semesters)
    .where(and(
      eq(semesters.school, DEFAULT_SEMESTER.school),
      eq(semesters.academicYear, DEFAULT_SEMESTER.academicYear),
      eq(semesters.semester, DEFAULT_SEMESTER.semester),
    ))
    .limit(1);
  if (!semester) throw new Error("Failed to initialize semester");
  return semester;
}

export interface SemesterConfigPatch {
  startDate: string;
  weekCount: number;
  timezone?: string;
}

// 显式的学期配置更新：只应被维护脚本/独立配置流程调用。
export async function applySemesterConfig(patch: SemesterConfigPatch) {
  const [semester] = await getDatabase()
    .insert(semesters)
    .values({
      school: DEFAULT_SEMESTER.school,
      academicYear: DEFAULT_SEMESTER.academicYear,
      semester: DEFAULT_SEMESTER.semester,
      startDate: patch.startDate,
      weekCount: patch.weekCount,
      timezone: patch.timezone ?? DEFAULT_SEMESTER.timezone,
    })
    .onConflictDoUpdate({
      target: [semesters.school, semesters.academicYear, semesters.semester],
      set: {
        startDate: patch.startDate,
        weekCount: patch.weekCount,
        ...(patch.timezone ? { timezone: patch.timezone } : {}),
      },
    })
    .returning();

  if (!semester) throw new Error("Failed to apply semester config");
  return semester;
}
