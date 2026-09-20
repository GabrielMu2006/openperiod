import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "@/src/server/db/schema";
import { DEFAULT_SEMESTER } from "@/src/config/semester";
import { getScheduleById, toScheduleDTO } from "@/src/config/school-schedules";
import type { ImportCourseDraft, ImportPreviewPayload } from "@/src/domain/import";

const mocks = vi.hoisted(() => ({ getDatabase: vi.fn() }));
vi.mock("@/src/server/db", () => ({ getDatabase: mocks.getDatabase }));

import { confirmImport, createImportPreview, restoreImportSnapshot } from "./data";
import { getMySchedule } from "@/src/server/schedule/data";
import { ensureDefaultSemester } from "@/src/server/semesters/data";

const client = new PGlite();
const database = drizzle(client, { schema });
const USER = "00000000-0000-4000-8000-00000000a201";

beforeAll(async () => {
  const journal = JSON.parse(await readFile(new URL("../../../drizzle/meta/_journal.json", import.meta.url), "utf8"));
  for (const entry of journal.entries) {
    await client.exec(await readFile(new URL(`../../../drizzle/${entry.tag}.sql`, import.meta.url), "utf8"));
  }
  mocks.getDatabase.mockReturnValue(database);
}, 30_000);

beforeEach(async () => {
  await client.exec("TRUNCATE users, semesters CASCADE");
});

afterAll(async () => client.close());

async function createUser(scheduleId: string) {
  await database.insert(schema.users).values({
    id: USER,
    email: "imp02-test@example.com",
    nickname: "跨校导入测试",
    scheduleId,
  });
}

async function seedCourse(semesterId: string, name: string, skipped = false) {
  const [course] = await database.insert(schema.courses).values({ userId: USER, semesterId, name }).returning();
  const [meeting] = await database.insert(schema.courseMeetings).values({
    courseId: course.id,
    weekday: 1,
    startPeriod: 1,
    endPeriod: 2,
    weeks: [1, 2],
  }).returning();
  if (skipped) {
    await database.insert(schema.courseExceptions).values({ courseMeetingId: meeting.id, userId: USER, week: 2 });
  }
}

function previewPayload(scheduleId: string): ImportPreviewPayload {
  const preset = getScheduleById(scheduleId);
  return {
    provider: "PKU_EXCEL",
    format: "ROW",
    scheduleId: scheduleId === "pku" ? undefined : scheduleId,
    schedule: toScheduleDTO(preset),
    courses: [],
    warnings: [],
    stats: { courseCount: 0, meetingCount: 0, warningCount: 0 },
  };
}

function draft(name: string): ImportCourseDraft {
  return {
    id: `draft-${name}`,
    name,
    meetings: [{
      id: `meeting-${name}`,
      weekday: "monday",
      startPeriod: 3,
      endPeriod: 4,
      weeks: [1, 2],
      source: "IMP-02 test",
    }],
  };
}

async function courseNamesBySchool() {
  const rows = await database
    .select({ name: schema.courses.name, school: schema.semesters.school })
    .from(schema.courses)
    .innerJoin(schema.semesters, eq(schema.courses.semesterId, schema.semesters.id));
  return rows.map((row) => `${row.school}:${row.name}`).sort();
}

describe("cross-school import target (IMP-02)", () => {
  it("switches the persisted current schedule to the imported school and preserves the old school", async () => {
    await createUser("pku");
    const pkuSemester = await ensureDefaultSemester("pku");
    await ensureDefaultSemester("uibe");
    await seedCourse(pkuSemester.id, "北大旧课程");

    const preview = await createImportPreview(USER, previewPayload("uibe"), "uibe");
    expect(preview.targetSemester).toMatchObject({
      academicYear: DEFAULT_SEMESTER.academicYear,
      semester: DEFAULT_SEMESTER.semester,
      weekCount: DEFAULT_SEMESTER.weekCount,
    });
    const imported = await confirmImport(USER, preview.id, [draft("贸大新课程")]);

    expect(imported).toMatchObject({ targetScheduleId: "uibe", snapshotId: null });
    expect((await database.select().from(schema.users))[0].scheduleId).toBe("uibe");
    const current = await getMySchedule(USER, 1);
    expect(current.semester.schedule.id).toBe("uibe");
    expect(current.courses.map((course) => course.name)).toEqual(["贸大新课程"]);
    expect(await courseNamesBySchool()).toEqual(["PKU:北大旧课程", "uibe:贸大新课程"]);
  });

  it("maps the legacy null semester schedule to pku when importing back from another school", async () => {
    await createUser("uibe");
    const uibeSemester = await ensureDefaultSemester("uibe");
    await ensureDefaultSemester("pku");
    await seedCourse(uibeSemester.id, "贸大旧课程");

    const preview = await createImportPreview(USER, previewPayload("pku"), "pku");
    const imported = await confirmImport(USER, preview.id, [draft("北大新课程")]);

    expect(imported.targetScheduleId).toBe("pku");
    expect((await database.select().from(schema.users))[0].scheduleId).toBe("pku");
    const current = await getMySchedule(USER, 1);
    expect(current.semester.schedule.id).toBe("pku");
    expect(current.courses.map((course) => course.name)).toEqual(["北大新课程"]);
    expect(await courseNamesBySchool()).toEqual(["PKU:北大新课程", "uibe:贸大旧课程"]);
  });

  it("restores only the replaced target semester and switches the current schedule back to it", async () => {
    await createUser("pku");
    const pkuSemester = await ensureDefaultSemester("pku");
    const uibeSemester = await ensureDefaultSemester("uibe");
    await seedCourse(pkuSemester.id, "北大保留课程");
    await seedCourse(uibeSemester.id, "贸大恢复课程", true);

    const preview = await createImportPreview(USER, previewPayload("uibe"), "uibe");
    const imported = await confirmImport(USER, preview.id, [draft("贸大临时新课程")]);
    expect(imported.snapshotId).toBeTruthy();
    await database.update(schema.users).set({ scheduleId: "pku" }).where(eq(schema.users.id, USER));

    const restored = await restoreImportSnapshot(USER, imported.snapshotId!);

    expect(restored).toMatchObject({ targetScheduleId: "uibe", courseCount: 1, meetingCount: 1, skipCount: 1 });
    expect((await database.select().from(schema.users))[0].scheduleId).toBe("uibe");
    expect(await courseNamesBySchool()).toEqual(["PKU:北大保留课程", "uibe:贸大恢复课程"]);
  });
});
