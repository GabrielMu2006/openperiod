import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "@/src/server/db/schema";
import { DEFAULT_SEMESTER } from "@/src/config/semester";
import { getScheduleById } from "@/src/config/school-schedules";

const mocks = vi.hoisted(() => ({ getDatabase: vi.fn() }));
vi.mock("@/src/server/db", () => ({ getDatabase: mocks.getDatabase }));

import { releaseSchoolSubmission, submitSchoolCandidate } from "@/src/server/school-submissions/data";

const client = new PGlite();
const database = drizzle(client, { schema });

const USER = "00000000-0000-4000-8000-00000000c0de";
const ROWS = [{ start: "08:30", end: "09:15" }, { start: "09:25", end: "10:10" }];

async function runMigrations() {
  const journal = JSON.parse(await readFile(new URL("../../../drizzle/meta/_journal.json", import.meta.url), "utf8"));
  for (const entry of journal.entries) {
    await client.exec(await readFile(new URL(`../../../drizzle/${entry.tag}.sql`, import.meta.url), "utf8"));
  }
}

async function createCourse(userId: string, semesterId: string, name: string) {
  const [course] = await database.insert(schema.courses).values({ userId, semesterId, name }).returning({ id: schema.courses.id });
  await database.insert(schema.courseMeetings).values({ courseId: course!.id, weekday: 1, startPeriod: 1, endPeriod: 2, weeks: [1, 2] });
  return course!.id;
}

beforeAll(async () => {
  await runMigrations();
  mocks.getDatabase.mockReturnValue(database);
  await database.insert(schema.users).values({ id: USER, email: "sch03-a@example.com", nickname: "候选甲", scheduleId: "custom" });
}, 30_000);

afterAll(async () => client.close());

describe("学校候选提交（SCH-03）", () => {
  it("提交候选：保存自定义网格、切到 custom、写入 pending 候选", async () => {
    const result = await submitSchoolCandidate(USER, "  某某  学院 ", ROWS);
    expect(result.updated).toBe(false);
    const [user] = await database.select().from(schema.users).where(eq(schema.users.id, USER));
    expect(user.scheduleId).toBe("custom");
    const [submission] = await database.select().from(schema.schoolSubmissions);
    expect(submission.schoolName).toBe("某某 学院");
    expect(submission.status).toBe("pending");
    expect(submission.scheduleRows).toEqual(ROWS);
  });

  it("同名 pending 提交会被覆盖更新，不产生重复候选", async () => {
    await submitSchoolCandidate(USER, "某某 学院", [...ROWS, { start: "10:30", end: "11:15" }]);
    const rows = await database.select().from(schema.schoolSubmissions);
    expect(rows).toHaveLength(1);
    expect(rows[0].scheduleRows).toHaveLength(3);
  });

  it("校名过短直接拒绝", async () => {
    await expect(submitSchoolCandidate(USER, "某", ROWS)).rejects.toMatchObject({ status: 400 });
  });
});

describe("完成迁移（SCH-03 收尾）", () => {
  it("未收录的预设 id 直接拒绝", async () => {
    const [submission] = await database.select().from(schema.schoolSubmissions);
    await expect(releaseSchoolSubmission(submission.id, "not-a-preset")).rejects.toMatchObject({ status: 400 });
  });

  it("未通过审核的候选不能迁移", async () => {
    const [submission] = await database.select().from(schema.schoolSubmissions);
    await expect(releaseSchoolSubmission(submission.id, "lzxk")).rejects.toMatchObject({ status: 409 });
  });

  it("审核通过后迁移：课程/忙碌/无课确认搬到新学期，账号切到预设", async () => {
    const [submission] = await database.select().from(schema.schoolSubmissions);
    await database.update(schema.schoolSubmissions).set({ status: "approved" }).where(eq(schema.schoolSubmissions.id, submission.id));

    const customSemester = await database.select().from(schema.semesters).where(eq(schema.semesters.school, "custom"));
    const courseId = await createCourse(USER, customSemester[0]!.id, "高等数学");
    await database.insert(schema.busyBlocks).values({ userId: USER, semesterId: customSemester[0]!.id, kind: "ONE_TIME", weekday: 3, startPeriod: 1, endPeriod: 1, weeks: [1] });
    await database.insert(schema.semesterConfirmations).values({ userId: USER, semesterId: customSemester[0]!.id });

    const result = await releaseSchoolSubmission(submission.id, "lzxk");
    expect(result.movedCourses).toBe(1);

    const presetSemesterId = (await database.select().from(schema.semesters).where(eq(schema.semesters.school, "lzxk")))[0]!.id;
    const [moved] = await database.select().from(schema.courses).where(eq(schema.courses.id, courseId));
    expect(moved.semesterId).toBe(presetSemesterId);
    const busy = await database.select().from(schema.busyBlocks).where(eq(schema.busyBlocks.userId, USER));
    expect(busy.every((row) => row.semesterId === presetSemesterId)).toBe(true);
    const confirmations = await database.select().from(schema.semesterConfirmations).where(eq(schema.semesterConfirmations.userId, USER));
    expect(confirmations.map((row) => row.semesterId)).toEqual([presetSemesterId]);
    const [user] = await database.select().from(schema.users).where(eq(schema.users.id, USER));
    expect(user.scheduleId).toBe("lzxk");
    const [released] = await database.select().from(schema.schoolSubmissions).where(eq(schema.schoolSubmissions.id, submission.id));
    expect(released.status).toBe("released");
    expect(getScheduleById("lzxk").school).toBe("兰州信息科技学院");
  });
});
