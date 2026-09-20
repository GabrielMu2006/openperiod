import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "@/src/server/db/schema";
import { DEFAULT_SEMESTER } from "@/src/config/semester";
import type { ImportPreviewPayload } from "@/src/domain/import";

const mocks = vi.hoisted(() => ({ getDatabase: vi.fn() }));
vi.mock("@/src/server/db", () => ({ getDatabase: mocks.getDatabase }));

import { confirmImport, createImportPreview } from "@/src/server/imports/data";
import { getUserCustomRows, saveUserCustomSchedule } from "./data";

const client = new PGlite();
const database = drizzle(client, { schema });

const USER_A = "00000000-0000-4000-8000-000000000aa1";
const USER_B = "00000000-0000-4000-8000-000000000bb2";
// 旧共享列上的历史网格：无法推断每位用户原本的意图，迁移按现状快照给每个 custom 用户
const LEGACY_GRID = [{ start: "08:00", end: "08:50" }, { start: "09:00", end: "09:45" }];
const GRID_A = [{ start: "08:30", end: "09:15" }];
const GRID_B = [{ start: "09:20", end: "10:05" }];

async function runMigrations(fromIdx: number, toIdx: number) {
  const journal = JSON.parse(await readFile(new URL("../../../drizzle/meta/_journal.json", import.meta.url), "utf8"));
  for (const entry of journal.entries.filter((entry: { idx: number }) => entry.idx >= fromIdx && entry.idx <= toIdx)) {
    await client.exec(await readFile(new URL(`../../../drizzle/${entry.tag}.sql`, import.meta.url), "utf8"));
  }
}

beforeAll(async () => {
  // 先执行 0008 及之前的迁移，再造旧共享数据，最后单独执行 0009 检验回填
  await runMigrations(0, 8);
  mocks.getDatabase.mockReturnValue(database);
  await database.insert(schema.semesters).values({
    school: "custom", academicYear: DEFAULT_SEMESTER.academicYear, semester: DEFAULT_SEMESTER.semester,
    startDate: DEFAULT_SEMESTER.startDate, weekCount: 16, scheduleId: "custom", customSchedule: LEGACY_GRID,
  });
  await database.insert(schema.users).values([
    { id: USER_A, email: "sch01-a@example.com", nickname: "自定义甲", scheduleId: "custom" },
    { id: USER_B, email: "sch01-b@example.com", nickname: "自定义乙", scheduleId: "custom" },
  ]);
  await runMigrations(9, 9);
}, 30_000);

afterAll(async () => client.close());

describe("0009 迁移回填（SCH-01）", () => {
  it("把共享历史作息快照到每位 custom 用户名下，原列保持不动", async () => {
    const rows = await database.select().from(schema.customSchedules);
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.scheduleRows).toEqual(LEGACY_GRID);
      expect(row.academicYear).toBe(DEFAULT_SEMESTER.academicYear);
    }
    const [legacy] = await database.select().from(schema.semesters).where(eq(schema.semesters.school, "custom"));
    expect(legacy.customSchedule).toEqual(LEGACY_GRID);
  });
});

describe("自定义作息按用户隔离（SCH-01）", () => {
  it("用户 A 更新作息不影响用户 B", async () => {
    await saveUserCustomSchedule(USER_A, GRID_A);
    expect(await getUserCustomRows(USER_A, DEFAULT_SEMESTER.academicYear, DEFAULT_SEMESTER.semester)).toEqual(GRID_A);
    expect(await getUserCustomRows(USER_B, DEFAULT_SEMESTER.academicYear, DEFAULT_SEMESTER.semester)).toEqual(LEGACY_GRID);
  });

  it("预览阶段不写入正式作息，确认导入后才生效", async () => {
    const payload: ImportPreviewPayload = {
      provider: "PKU_EXCEL", format: "ROW", scheduleId: "custom", customRows: GRID_B,
      courses: [], warnings: [], stats: { courseCount: 0, meetingCount: 0, warningCount: 0 },
    };
    const preview = await createImportPreview(USER_B, payload, "custom");
    // 预览已创建，但 B 的正式作息仍是旧网格
    expect(await getUserCustomRows(USER_B, DEFAULT_SEMESTER.academicYear, DEFAULT_SEMESTER.semester)).toEqual(LEGACY_GRID);

    // 放弃该预览（不确认）也不改变正式作息
    await createImportPreview(USER_B, { ...payload, customRows: [{ start: "23:00", end: "23:50" }] }, "custom");
    expect(await getUserCustomRows(USER_B, DEFAULT_SEMESTER.academicYear, DEFAULT_SEMESTER.semester)).toEqual(LEGACY_GRID);

    // 确认导入后才采用预览中核对的版本
    await confirmImport(USER_B, preview.id, []);
    expect(await getUserCustomRows(USER_B, DEFAULT_SEMESTER.academicYear, DEFAULT_SEMESTER.semester)).toEqual(GRID_B);
    // A 始终不受影响
    expect(await getUserCustomRows(USER_A, DEFAULT_SEMESTER.academicYear, DEFAULT_SEMESTER.semester)).toEqual(GRID_A);
  });
});
