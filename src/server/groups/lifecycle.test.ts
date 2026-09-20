import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "@/src/server/db/schema";

const mocks = vi.hoisted(() => ({ getDatabase: vi.fn() }));
vi.mock("@/src/server/db", () => ({ getDatabase: mocks.getDatabase }));

import { getGroupAvailability } from "@/src/server/availability/data";
import {
  joinGroup,
  leaveGroup,
  listGroupsForUser,
  regenerateInviteCode,
  removeGroupMember,
  renameGroup,
  setGroupArchived,
  transferGroupOwnership,
  updateGroupPrivacy,
} from "./data";

const client = new PGlite();
const database = drizzle(client, { schema });

const OWNER = "10000000-0000-4000-8000-000000000001";
const MEMBER = "10000000-0000-4000-8000-000000000002";
const OTHER = "10000000-0000-4000-8000-000000000003";
const CUSTOM_MEMBER = "10000000-0000-4000-8000-000000000004";
let semesterId = "";
let customSemesterId = "";

async function makeGroup(name: string, inviteCode: string, options: { custom?: boolean } = {}) {
  const [group] = await database.insert(schema.groups).values({
    name,
    inviteCode,
    ownerId: OWNER,
    semesterId: options.custom ? customSemesterId : semesterId,
  }).returning();
  await database.insert(schema.groupMembers).values([
    { groupId: group.id, userId: OWNER, role: "OWNER" },
    { groupId: group.id, userId: options.custom ? CUSTOM_MEMBER : MEMBER, role: "MEMBER" },
  ]);
  return group;
}

beforeAll(async () => {
  const journal = JSON.parse(await readFile(new URL("../../../drizzle/meta/_journal.json", import.meta.url), "utf8"));
  for (const entry of journal.entries) {
    await client.exec(await readFile(new URL(`../../../drizzle/${entry.tag}.sql`, import.meta.url), "utf8"));
  }
  mocks.getDatabase.mockReturnValue(database);

  const [semester, customSemester] = await database.insert(schema.semesters).values([
    { school: "PKU", academicYear: "2026–2027", semester: "秋季学期", startDate: "2026-09-07", weekCount: 16, scheduleId: "pku" },
    { school: "custom", academicYear: "2026–2027", semester: "秋季学期", startDate: "2026-09-07", weekCount: 16, scheduleId: "custom" },
  ]).returning();
  semesterId = semester.id;
  customSemesterId = customSemester.id;

  await database.insert(schema.users).values([
    { id: OWNER, email: "group-owner-test@example.com", nickname: "群主", scheduleId: "pku" },
    { id: MEMBER, email: "group-member-test@example.com", nickname: "成员", scheduleId: "pku" },
    { id: OTHER, email: "group-other-test@example.com", nickname: "其他人", scheduleId: "pku" },
    { id: CUSTOM_MEMBER, email: "group-custom-test@example.com", nickname: "自定义成员", scheduleId: "custom" },
  ]);

  const [course] = await database.insert(schema.courses).values({
    userId: MEMBER,
    semesterId,
    name: "成员的保留课程",
  }).returning();
  await database.insert(schema.courseMeetings).values({
    courseId: course.id,
    weekday: 1,
    startPeriod: 1,
    endPeriod: 2,
    weeks: [1, 2],
  });
}, 30_000);

afterAll(async () => client.close());

describe("GROUP-01 群组生命周期", () => {
  it("0010 是增量迁移，已有群组和成员原样保留且默认未归档", async () => {
    const migrationClient = new PGlite();
    try {
      const journal = JSON.parse(await readFile(new URL("../../../drizzle/meta/_journal.json", import.meta.url), "utf8"));
      for (const entry of journal.entries.filter((item: { idx: number }) => item.idx < 10)) {
        await migrationClient.exec(await readFile(new URL(`../../../drizzle/${entry.tag}.sql`, import.meta.url), "utf8"));
      }
      await migrationClient.exec(`
        INSERT INTO users (id, nickname, email) VALUES ('20000000-0000-4000-8000-000000000001', '迁移测试', 'group-migration-test@example.com');
        INSERT INTO semesters (id, school, academic_year, semester, start_date) VALUES ('20000000-0000-4000-8000-000000000002', 'PKU', '2026–2027', '秋季学期', '2026-09-07');
        INSERT INTO groups (id, name, invite_code, owner_id, semester_id) VALUES ('20000000-0000-4000-8000-000000000003', '迁移前群组', 'MIGRATE1', '20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002');
        INSERT INTO group_members (group_id, user_id, role) VALUES ('20000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', 'OWNER');
      `);
      await migrationClient.exec(await readFile(new URL("../../../drizzle/0010_group_lifecycle.sql", import.meta.url), "utf8"));
      const result = await migrationClient.query<{ name: string; archived_at: Date | null; members: number }>(`
        SELECT g.name, g.archived_at, count(gm.user_id)::int AS members
        FROM groups g LEFT JOIN group_members gm ON gm.group_id = g.id
        WHERE g.id = '20000000-0000-4000-8000-000000000003'
        GROUP BY g.id
      `);
      expect(result.rows).toEqual([{ name: "迁移前群组", archived_at: null, members: 1 }]);
    } finally {
      await migrationClient.close();
    }
  }, 30_000);

  it("归档后从正常列表隐藏、邀请码和共同空闲停用，恢复后成员与隐私原样保留", async () => {
    const group = await makeGroup("可恢复群组", "ARCHIVE1");
    await database.insert(schema.groupPrivacyOverrides).values({ groupId: group.id, userId: MEMBER, privacyLevel: 2 });

    await setGroupArchived(OWNER, group.id, true);
    expect((await listGroupsForUser(OWNER)).some((item) => item.id === group.id)).toBe(false);
    const archived = (await listGroupsForUser(OWNER, { includeArchived: true })).find((item) => item.id === group.id);
    expect(archived?.archivedAt).toBeInstanceOf(Date);
    expect(archived?.members).toHaveLength(2);

    await expect(joinGroup(OTHER, "archive1", null)).rejects.toMatchObject({ status: 404 });
    await expect(getGroupAvailability(OWNER, group.id, 1, [OWNER])).rejects.toMatchObject({ status: 410 });
    await expect(updateGroupPrivacy(MEMBER, group.id, 1)).rejects.toMatchObject({ status: 409 });
    await expect(regenerateInviteCode(OWNER, group.id)).rejects.toMatchObject({ status: 409 });

    await setGroupArchived(OWNER, group.id, false);
    await joinGroup(OTHER, "archive1", null);
    expect((await database.select().from(schema.groupMembers).where(eq(schema.groupMembers.groupId, group.id)))).toHaveLength(3);
    expect(await database.select().from(schema.groupPrivacyOverrides).where(and(
      eq(schema.groupPrivacyOverrides.groupId, group.id),
      eq(schema.groupPrivacyOverrides.userId, MEMBER),
    ))).toHaveLength(1);
  });

  it("普通成员可退出且只移除成员关系与群内隐私；群主不能直接退出", async () => {
    const group = await makeGroup("退出测试群", "LEAVE001");
    await database.insert(schema.groupPrivacyOverrides).values({ groupId: group.id, userId: MEMBER, privacyLevel: 1 });

    await expect(leaveGroup(OWNER, group.id)).rejects.toMatchObject({ status: 409 });
    await leaveGroup(MEMBER, group.id);

    expect(await database.select().from(schema.groupMembers).where(and(
      eq(schema.groupMembers.groupId, group.id),
      eq(schema.groupMembers.userId, MEMBER),
    ))).toHaveLength(0);
    expect(await database.select().from(schema.groupPrivacyOverrides).where(and(
      eq(schema.groupPrivacyOverrides.groupId, group.id),
      eq(schema.groupPrivacyOverrides.userId, MEMBER),
    ))).toHaveLength(0);
    expect(await database.select().from(schema.users).where(eq(schema.users.id, MEMBER))).toHaveLength(1);
    expect(await database.select().from(schema.courses).where(eq(schema.courses.userId, MEMBER))).toHaveLength(1);
  });

  it("只有群主能移出成员，且不会删除成员账号或课程", async () => {
    const group = await makeGroup("移出测试群", "REMOVE01");
    await expect(removeGroupMember(OTHER, group.id, MEMBER)).rejects.toMatchObject({ status: 403 });
    await expect(removeGroupMember(OWNER, group.id, OWNER)).rejects.toMatchObject({ status: 400 });

    await removeGroupMember(OWNER, group.id, MEMBER);
    expect(await database.select().from(schema.groupMembers).where(and(
      eq(schema.groupMembers.groupId, group.id),
      eq(schema.groupMembers.userId, MEMBER),
    ))).toHaveLength(0);
    expect(await database.select().from(schema.users).where(eq(schema.users.id, MEMBER))).toHaveLength(1);
    expect(await database.select().from(schema.courses).where(eq(schema.courses.userId, MEMBER))).toHaveLength(1);
  });

  it("转让群主在同一事务更新所有权和角色，原群主随后可退出", async () => {
    const group = await makeGroup("转让测试群", "TRANSFER");
    await transferGroupOwnership(OWNER, group.id, MEMBER);

    const [storedGroup] = await database.select().from(schema.groups).where(eq(schema.groups.id, group.id));
    const memberships = await database.select().from(schema.groupMembers).where(eq(schema.groupMembers.groupId, group.id));
    expect(storedGroup.ownerId).toBe(MEMBER);
    expect(memberships.filter((item) => item.role === "OWNER")).toEqual([
      expect.objectContaining({ userId: MEMBER }),
    ]);
    await expect(renameGroup(OWNER, group.id, "旧群主不能改名")).rejects.toMatchObject({ status: 403 });
    await renameGroup(MEMBER, group.id, "新群主已接管");
    await leaveGroup(OWNER, group.id);
    expect(await database.select().from(schema.groupMembers).where(eq(schema.groupMembers.groupId, group.id))).toHaveLength(1);
  });

  it("自定义作息不一致时拒绝转让，避免群组时间轴被静默改变", async () => {
    const group = await makeGroup("自定义作息群", "CUSTOM01", { custom: true });
    await database.insert(schema.customSchedules).values([
      { userId: OWNER, academicYear: "2026–2027", semester: "秋季学期", scheduleRows: [{ start: "08:00", end: "08:50" }] },
      { userId: CUSTOM_MEMBER, academicYear: "2026–2027", semester: "秋季学期", scheduleRows: [{ start: "09:00", end: "09:50" }] },
    ]);

    await expect(transferGroupOwnership(OWNER, group.id, CUSTOM_MEMBER)).rejects.toMatchObject({ status: 409 });
    const [storedGroup] = await database.select().from(schema.groups).where(eq(schema.groups.id, group.id));
    expect(storedGroup.ownerId).toBe(OWNER);
  });
});
