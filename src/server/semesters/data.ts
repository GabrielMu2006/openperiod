import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { DEFAULT_SEMESTER, getTeachingWeek } from "@/src/config/semester";
import { PKU_SCHEDULE, getScheduleById } from "@/src/config/school-schedules";
import type { MemberScheduleState } from "@/src/domain/schedule";
import { getDatabase } from "@/src/server/db";
import { busyBlocks, courses, customSchedules, semesterConfirmations, semesters } from "@/src/server/db/schema";

// 读路径专用：学期存在就原样返回，不存在才按默认配置创建，绝不覆盖已有配置。
// 修改开学日/周数请走 applySemesterConfig（独立维护流程），不要在这里加更新逻辑。
//
// 多学校支持：每所学校各自一条学期记录（school 列 = 预设 id，北大沿用历史值保持
// 存量数据不变）。开学日/周数暂与北大默认一致，各校差异由 applySemesterConfig 或
// 预设默认值后续补充。
export async function ensureDefaultSemester(scheduleId?: string | null) {
  const isCustom = scheduleId === "custom";
  const preset = getScheduleById(scheduleId);
  const isDefault = !isCustom && preset.id === PKU_SCHEDULE.id;
  const schoolKey = isDefault ? DEFAULT_SEMESTER.school : isCustom ? "custom" : preset.id;
  const scheduleColumnValue = isDefault ? null : isCustom ? "custom" : preset.id;

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

// 自定义作息（SCH-01）：网格按用户 + 学年/学期隔离存储在 custom_schedules，
// 不再写共享的 school='custom' 学期行；该学期行仅作为课程数据的挂载容器。
// 预览阶段不得调用本函数——只有确认导入后才落库。
export async function saveUserCustomSchedule(userId: string, rows: { start: string; end: string }[]) {
  await getDatabase()
    .insert(customSchedules)
    .values({ userId, academicYear: DEFAULT_SEMESTER.academicYear, semester: DEFAULT_SEMESTER.semester, scheduleRows: rows })
    .onConflictDoUpdate({
      target: [customSchedules.userId, customSchedules.academicYear, customSchedules.semester],
      set: { scheduleRows: rows, updatedAt: new Date() },
    });
}

// 读取用户自己的自定义作息行；没有则为 null（调用方回落学校预设）
export async function getUserCustomRows(
  userId: string,
  academicYear: string,
  semesterName: string,
): Promise<{ start: string; end: string; label?: string }[] | null> {
  const [row] = await getDatabase()
    .select({ rows: customSchedules.scheduleRows })
    .from(customSchedules)
    .where(and(
      eq(customSchedules.userId, userId),
      eq(customSchedules.academicYear, academicYear),
      eq(customSchedules.semester, semesterName),
    ))
    .limit(1);
  return row?.rows ?? null;
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

// 成员学期定位键：跟随成员自己学校的作息预设（未设置/未知 → 北大默认），custom 作息独立成键。
// 群组完整度统计与共同空闲计算必须共用同一规则，跨校成员才能各自对到自己的学期（AV-04）。
export function memberSchoolKey(userScheduleId: string | null | undefined) {
  if (userScheduleId === "custom") return "custom";
  const preset = getScheduleById(userScheduleId ?? null);
  return preset.id === "pku" ? "PKU" : preset.id;
}

export interface MemberScheduleSummary {
  /** 成员自己学校对应（学年/学期名）的学期行；没有则为 null */
  semesterId: string | null;
  courseCount: number;
  state: MemberScheduleState;
}

// 按成员自己学校的学期汇总课表完整度：课程、忙碌与显式无课确认共同决定三态（与 AV-03 一致）。
// 学期行按（学校键, 学年, 学期名）共享，跨校成员各对到各自的学期行。
export async function summarizeMemberSchedules(
  members: { id: string; scheduleId: string | null }[],
  academicYear: string,
  semesterName: string,
): Promise<Map<string, MemberScheduleSummary>> {
  const summaries = new Map<string, MemberScheduleSummary>();
  for (const member of members) {
    summaries.set(member.id, { semesterId: null, courseCount: 0, state: "unrecorded" });
  }
  if (!members.length) return summaries;

  const db = getDatabase();
  const schoolKeyByUser = new Map(members.map((member) => [member.id, memberSchoolKey(member.scheduleId)]));
  const schoolKeys = [...new Set(schoolKeyByUser.values())];
  const semesterRows = await db
    .select({ id: semesters.id, school: semesters.school })
    .from(semesters)
    .where(and(
      eq(semesters.academicYear, academicYear),
      eq(semesters.semester, semesterName),
      inArray(semesters.school, schoolKeys),
    ));
  const semesterIdByUser = new Map(
    [...schoolKeyByUser].map(([userId, schoolKey]) => [
      userId,
      semesterRows.find((row) => row.school === schoolKey)?.id ?? null,
    ]),
  );

  const userIds = members.map((member) => member.id);
  const semesterIds = [...new Set([...semesterIdByUser.values()].filter((id): id is string => Boolean(id)))];
  const summaryKey = (userId: string, semesterId: string | null) => `${userId}:${semesterId ?? "none"}`;
  if (!semesterIds.length) return summaries;

  const [courseCounts, busyCounts, confirmations] = await Promise.all([
    db
      .select({ userId: courses.userId, semesterId: courses.semesterId, count: sql<number>`count(*)::int` })
      .from(courses)
      .where(and(inArray(courses.userId, userIds), inArray(courses.semesterId, semesterIds)))
      .groupBy(courses.userId, courses.semesterId),
    db
      .select({ userId: busyBlocks.userId, semesterId: busyBlocks.semesterId, count: sql<number>`count(*)::int` })
      .from(busyBlocks)
      .where(and(inArray(busyBlocks.userId, userIds), inArray(busyBlocks.semesterId, semesterIds)))
      .groupBy(busyBlocks.userId, busyBlocks.semesterId),
    db
      .select({ userId: semesterConfirmations.userId, semesterId: semesterConfirmations.semesterId })
      .from(semesterConfirmations)
      .where(and(inArray(semesterConfirmations.userId, userIds), inArray(semesterConfirmations.semesterId, semesterIds))),
  ]);
  const courseCountBy = new Map(courseCounts.map((row) => [summaryKey(row.userId, row.semesterId), row.count]));
  const busyCountBy = new Map(busyCounts.map((row) => [summaryKey(row.userId, row.semesterId), row.count]));
  const confirmedKeys = new Set(confirmations.map((row) => summaryKey(row.userId, row.semesterId)));

  for (const member of members) {
    const semesterId = semesterIdByUser.get(member.id) ?? null;
    const key = summaryKey(member.id, semesterId);
    const courseCount = courseCountBy.get(key) ?? 0;
    const busyCount = busyCountBy.get(key) ?? 0;
    const state: MemberScheduleState = courseCount > 0 || busyCount > 0
      ? "recorded"
      : confirmedKeys.has(key)
        ? "confirmedEmpty"
        : "unrecorded";
    summaries.set(member.id, { semesterId, courseCount, state });
  }
  return summaries;
}
