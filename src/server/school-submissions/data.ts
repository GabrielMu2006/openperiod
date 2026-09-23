import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { getScheduleById } from "@/src/config/school-schedules";
import { DEFAULT_SEMESTER } from "@/src/config/semester";
import { getDatabase } from "@/src/server/db";
import { busyBlocks, courses, schoolSubmissions, semesterConfirmations, users } from "@/src/server/db/schema";
import { ensureDefaultSemester, saveUserCustomSchedule } from "@/src/server/semesters/data";
import { HttpError } from "@/src/server/http";

export const SCHOOL_NAME_MAX = 40;

// 提交学校候选（SCH-03）：保存逐节作息为该用户的自定义网格并切换到 custom，
// 同时把「学校名称 + 节次时间」写入候选池等待人工审核。同名 pending 提交会被覆盖更新。
export async function submitSchoolCandidate(userId: string, schoolNameInput: string, rows: { start: string; end: string }[]) {
  const schoolName = schoolNameInput.trim().replace(/\s+/g, " ");
  if (schoolName.length < 2 || schoolName.length > SCHOOL_NAME_MAX) {
    throw new HttpError(400, "学校名称需要 2–40 个字");
  }
  const database = getDatabase();
  await ensureDefaultSemester("custom");
  await saveUserCustomSchedule(userId, rows);
  await database
    .update(users)
    .set({ scheduleId: "custom", updatedAt: new Date() })
    .where(eq(users.id, userId));
  const [existing] = await database
    .select({ id: schoolSubmissions.id })
    .from(schoolSubmissions)
    .where(and(
      eq(schoolSubmissions.userId, userId),
      eq(schoolSubmissions.schoolName, schoolName),
      eq(schoolSubmissions.status, "pending"),
    ))
    .limit(1);
  if (existing) {
    await database
      .update(schoolSubmissions)
      .set({ scheduleRows: rows, updatedAt: new Date() })
      .where(eq(schoolSubmissions.id, existing.id));
    return { submissionId: existing.id, updated: true };
  }
  const [created] = await database
    .insert(schoolSubmissions)
    .values({ userId, schoolName, scheduleRows: rows })
    .returning({ id: schoolSubmissions.id });
  if (!created) throw new Error("Failed to create school submission");
  return { submissionId: created.id, updated: false };
}

export async function listSchoolSubmissions() {
  const rows = await getDatabase()
    .select({
      id: schoolSubmissions.id,
      schoolName: schoolSubmissions.schoolName,
      scheduleRows: schoolSubmissions.scheduleRows,
      status: schoolSubmissions.status,
      reviewNote: schoolSubmissions.reviewNote,
      createdAt: schoolSubmissions.createdAt,
      nickname: users.nickname,
      email: users.email,
    })
    .from(schoolSubmissions)
    .leftJoin(users, eq(schoolSubmissions.userId, users.id))
    .orderBy(desc(schoolSubmissions.createdAt))
    .limit(200);
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}

// 人工审核：approve / reject。收录本身仍由项目所有者改代码发版，这里只管理候选状态。
export async function reviewSchoolSubmission(submissionId: string, action: "approve" | "reject", note?: string) {
  const database = getDatabase();
  const [row] = await database
    .select({ id: schoolSubmissions.id, status: schoolSubmissions.status })
    .from(schoolSubmissions)
    .where(eq(schoolSubmissions.id, submissionId))
    .limit(1);
  if (!row) throw new HttpError(404, "候选不存在");
  if (row.status === "released") throw new HttpError(409, "该候选已完成迁移，不能再修改状态");
  await database
    .update(schoolSubmissions)
    .set({ status: action === "approve" ? "approved" : "rejected", reviewNote: note?.trim() || null, updatedAt: new Date() })
    .where(eq(schoolSubmissions.id, submissionId));
  return { status: action === "approve" ? "approved" : "rejected" };
}

// 完成迁移（SCH-03 收尾）：预设已收录发版后，把提交者挂在自定义学期上的课程/忙碌/无课确认
// 整体搬到新学校的学期，并把账号从 custom 切到该预设。全程一个事务，失败即回滚。
export async function releaseSchoolSubmission(submissionId: string, presetId: string) {
  if (getScheduleById(presetId).id !== presetId) {
    throw new HttpError(400, "该学校预设尚未收录上线（代码里找不到这个 id）");
  }
  const database = getDatabase();
  const [submission] = await database
    .select({ id: schoolSubmissions.id, userId: schoolSubmissions.userId, status: schoolSubmissions.status })
    .from(schoolSubmissions)
    .where(eq(schoolSubmissions.id, submissionId))
    .limit(1);
  if (!submission) throw new HttpError(404, "候选不存在");
  if (submission.status !== "approved") throw new HttpError(409, "仅「已通过审核」的候选可以执行迁移");

  const target = await ensureDefaultSemester(presetId);
  const customSemester = await ensureDefaultSemester("custom");

  const result = await database.transaction(async (tx) => {
    const [user] = await tx
      .select({ id: users.id, scheduleId: users.scheduleId })
      .from(users)
      .where(eq(users.id, submission.userId))
      .limit(1);
    if (!user) throw new HttpError(404, "提交者账号不存在");
    if (user.scheduleId !== "custom") {
      throw new HttpError(409, "该用户已不在自定义作息上，无需迁移");
    }

    // 课程与私人忙碌按学期挂载，整体搬到目标学期
    const movedCourses = await tx
      .update(courses)
      .set({ semesterId: target.id })
      .where(and(eq(courses.userId, submission.userId), eq(courses.semesterId, customSemester.id)))
      .returning({ id: courses.id });
    await tx
      .update(busyBlocks)
      .set({ semesterId: target.id })
      .where(and(eq(busyBlocks.userId, submission.userId), eq(busyBlocks.semesterId, customSemester.id)));
    // 无课确认：目标学期已有确认时保留原确认（语义相同），再清掉来源行
    await tx.execute(sql`
      insert into semester_confirmations (user_id, semester_id, confirmed_at)
      select user_id, ${target.id}::uuid, confirmed_at from semester_confirmations
      where user_id = ${submission.userId}::uuid and semester_id = ${customSemester.id}::uuid
      on conflict do nothing
    `);
    await tx.execute(sql`
      delete from semester_confirmations
      where user_id = ${submission.userId}::uuid and semester_id = ${customSemester.id}::uuid
    `);
    await tx
      .update(users)
      .set({ scheduleId: presetId, updatedAt: new Date() })
      .where(eq(users.id, submission.userId));
    await tx
      .update(schoolSubmissions)
      .set({ status: "released", updatedAt: new Date() })
      .where(eq(schoolSubmissions.id, submissionId));
    return { movedCourses: movedCourses.length };
  });
  return { presetId, semester: { academicYear: DEFAULT_SEMESTER.academicYear, semester: DEFAULT_SEMESTER.semester }, ...result };
}
