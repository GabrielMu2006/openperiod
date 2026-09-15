import "server-only";
import { and, eq } from "drizzle-orm";
import { DEFAULT_SEMESTER, getTeachingWeek } from "@/src/config/semester";
import { PKU_SCHEDULE, getScheduleById } from "@/src/config/school-schedules";
import { getDatabase } from "@/src/server/db";
import { semesters } from "@/src/server/db/schema";

// 读路径专用：学期存在就原样返回，不存在才按默认配置创建，绝不覆盖已有配置。
// 修改开学日/周数请走 applySemesterConfig（独立维护流程），不要在这里加更新逻辑。
//
// 多学校支持：每所学校各自一条学期记录（school 列 = 预设 id，北大沿用历史值保持
// 存量数据不变）。开学日/周数暂与北大默认一致，各校差异由 applySemesterConfig 或
// 预设默认值后续补充。
export async function ensureDefaultSemester(scheduleId?: string | null) {
  const preset = getScheduleById(scheduleId);
  const isDefault = preset.id === PKU_SCHEDULE.id;
  const schoolKey = isDefault ? DEFAULT_SEMESTER.school : preset.id;
  const scheduleColumnValue = isDefault ? null : preset.id;

  const database = getDatabase();
  const [existing] = await database
    .select()
    .from(semesters)
    .where(and(
      eq(semesters.school, schoolKey),
      eq(semesters.academicYear, DEFAULT_SEMESTER.academicYear),
      eq(semesters.semester, DEFAULT_SEMESTER.semester),
    ))
    .limit(1);

  const semester = existing ?? (await createDefaultSemester(database, schoolKey, scheduleColumnValue));
  return {
    ...semester,
    currentWeek: getTeachingWeek(semester),
  };
}

async function createDefaultSemester(
  database: ReturnType<typeof getDatabase>,
  schoolKey: string,
  scheduleColumnValue: string | null,
) {
  const [created] = await database
    .insert(semesters)
    .values({
      school: schoolKey,
      academicYear: DEFAULT_SEMESTER.academicYear,
      semester: DEFAULT_SEMESTER.semester,
      startDate: DEFAULT_SEMESTER.startDate,
      weekCount: DEFAULT_SEMESTER.weekCount,
      timezone: DEFAULT_SEMESTER.timezone,
      scheduleId: scheduleColumnValue,
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
      eq(semesters.school, schoolKey),
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
