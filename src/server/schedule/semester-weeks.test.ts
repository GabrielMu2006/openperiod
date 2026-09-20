import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "@/src/server/db/schema";
import { DEFAULT_SEMESTER } from "@/src/config/semester";

const mocks = vi.hoisted(() => ({ getDatabase: vi.fn() }));
vi.mock("@/src/server/db", () => ({ getDatabase: mocks.getDatabase }));

import { createBusyBlock, createCourse, getMySchedule } from "./data";
import { getGroupAvailability } from "@/src/server/availability/data";
import { createImportPreview } from "@/src/server/imports/data";

const client = new PGlite();
const database = drizzle(client, { schema });

const USER = "00000000-0000-4000-8000-000000000f01";
let groupId = "";

beforeAll(async () => {
  const journal = JSON.parse(await readFile(new URL("../../../drizzle/meta/_journal.json", import.meta.url), "utf8"));
  for (const entry of journal.entries) {
    await client.exec(await readFile(new URL(`../../../drizzle/${entry.tag}.sql`, import.meta.url), "utf8"));
  }
  mocks.getDatabase.mockReturnValue(database);

  // 该学期配置为 20 周：第 17–20 周是合法教学周（SCH-02）
  const [semester] = await database.insert(schema.semesters).values({
    school: DEFAULT_SEMESTER.school, academicYear: DEFAULT_SEMESTER.academicYear, semester: DEFAULT_SEMESTER.semester,
    startDate: DEFAULT_SEMESTER.startDate, weekCount: 20,
  }).returning();
  await database.insert(schema.users).values([
    { id: USER, email: "sch02-user@example.com", nickname: "二十周同学" },
  ]);
  const [group] = await database.insert(schema.groups).values({
    name: "SCH-02 群", inviteCode: "sch02group", ownerId: USER, semesterId: semester.id,
  }).returning();
  groupId = group.id;
  await database.insert(schema.groupMembers).values([
    { groupId: group.id, userId: USER },
  ]);
}, 30_000);

afterAll(async () => client.close());

describe("教学周数由学期配置驱动（SCH-02）", () => {
  it("第 17–20 周的课程可以录入并在个人课表查询", async () => {
    const { id } = await createCourse(USER, {
      name: "长学期课程",
      meetings: [{ weekday: "monday", startPeriod: 1, endPeriod: 2, weeks: [1, 17, 18, 19, 20] }],
    });
    expect(id).toBeTruthy();

    const schedule = await getMySchedule(USER, 17);
    expect(schedule.week).toBe(17);
    const meetings = schedule.courses.find((course) => course.name === "长学期课程")?.meetings ?? [];
    expect(meetings[0]?.weeks).toEqual([1, 17, 18, 19, 20]);
  });

  it("超出学期周数的录入与查询被拒绝", async () => {
    await expect(createCourse(USER, {
      name: "越界课程",
      meetings: [{ weekday: "monday", startPeriod: 1, endPeriod: 2, weeks: [21] }],
    })).rejects.toMatchObject({ status: 400 });

    await expect(createBusyBlock(USER, {
      kind: "ONE_TIME", weekday: "monday", startPeriod: 1, endPeriod: 1, weeks: [21],
    })).rejects.toMatchObject({ status: 400 });

    await expect(getMySchedule(USER, 21)).rejects.toMatchObject({ status: 400 });
  });

  it("群组共同空闲同样按群组学期周数驱动", async () => {
    // 第 17 周可查询；周一第 1 节该成员有课（在第 17 周上课）
    const availability = await getGroupAvailability(USER, groupId, 17, [USER]);
    expect(availability.week).toBe(17);
    expect(availability.slots.monday["1"]).toMatchObject({ freeCount: 0, unknownCount: 0 });

    await expect(getGroupAvailability(USER, groupId, 21, [USER]))
      .rejects.toMatchObject({ status: 400 });
  });

  it("导入预览携带目标学期的实际周数", async () => {
    const preview = await createImportPreview(USER, {
      provider: "PKU_EXCEL",
      format: "ROW",
      courses: [],
      warnings: [],
      stats: { courseCount: 0, meetingCount: 0, warningCount: 0 },
    }, "pku");

    expect(preview.weekCount).toBe(20);
  });
});
