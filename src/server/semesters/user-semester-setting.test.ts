import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "@/src/server/db/schema";
import { DEFAULT_SEMESTER } from "@/src/config/semester";

const mocks = vi.hoisted(() => ({ getDatabase: vi.fn() }));
vi.mock("@/src/server/db", () => ({ getDatabase: mocks.getDatabase }));

import { clearUserSemesterSetting, getEffectiveUserSemester, getUserSemesterSetting, setUserSemesterSetting } from "./data";

const client = new PGlite();
const database = drizzle(client, { schema });
const USER = "00000000-0000-4000-8000-000000005e7a";

beforeAll(async () => {
  const journal = JSON.parse(await readFile(new URL("../../../drizzle/meta/_journal.json", import.meta.url), "utf8"));
  for (const entry of journal.entries) {
    await client.exec(await readFile(new URL(`../../../drizzle/${entry.tag}.sql`, import.meta.url), "utf8"));
  }
  mocks.getDatabase.mockReturnValue(database);
  await database.insert(schema.users).values({ id: USER, email: "user-sem@example.com", nickname: "学期覆盖", scheduleId: "pku" });
  await setUserSemesterSetting(USER, { startDate: "2026-01-05", weekCount: 30 });
}, 30_000);

afterAll(async () => client.close());

describe("用户级学期设置（USER-SEM）", () => {
  it("覆盖开学日与周数：生效学期合并覆盖值，currentWeek 按覆盖开学日重算", async () => {
    const effective = await getEffectiveUserSemester(USER, "pku");
    expect(effective.startDate).toBe("2026-01-05");
    expect(effective.weekCount).toBe(30);
    // 2026-01-05 起算远超 30 周，currentWeek 被周数上限截断
    expect(effective.currentWeek).toBe(30);
    const base = await ensureBaseRow();
    expect(base.weekCount).toBe(DEFAULT_SEMESTER.weekCount);
  });

  it("getUserSemesterSetting 只在当前默认学年/学期上生效", async () => {
    const override = await getUserSemesterSetting(USER);
    expect(override).toEqual({ startDate: "2026-01-05", weekCount: 30 });
    const other = await getUserSemesterSetting(USER, "1999–2000", "春季学期");
    expect(other).toBeNull();
  });

  it("清除覆盖后回落学校学期行默认值", async () => {
    await clearUserSemesterSetting(USER);
    expect(await getUserSemesterSetting(USER)).toBeNull();
    const effective = await getEffectiveUserSemester(USER, "pku");
    expect(effective.startDate).toBe(DEFAULT_SEMESTER.startDate);
    expect(effective.weekCount).toBe(DEFAULT_SEMESTER.weekCount);
    // 恢复覆盖供其他用例使用
    await setUserSemesterSetting(USER, { startDate: "2026-01-05", weekCount: 30 });
    expect((await getUserSemesterSetting(USER))?.weekCount).toBe(30);
  });
});

async function ensureBaseRow() {
  const [row] = await database.select().from(schema.semesters).where(eq(schema.semesters.school, "PKU"));
  return row!;
}
