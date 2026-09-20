import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "@/src/server/db/schema";

const mocks = vi.hoisted(() => ({ getDatabase: vi.fn() }));
vi.mock("@/src/server/db", () => ({ getDatabase: mocks.getDatabase }));

import { getGroupAvailability, getGroupAvailabilityDetails } from "./data";
import { listGroupsForUser } from "@/src/server/groups/data";
import { getMySchedule, replaceMeetingSkips } from "@/src/server/schedule/data";

const client = new PGlite();
const database = drizzle(client, { schema });

// 群基准：北大 2026 秋，开学 2026-09-07；成员是对外经贸预设，9/14 才开学；
// 另有一位自定义作息成员，在第 3 小节（12:10–12:50，落在北大网格行之间的午间）有忙碌；
// 还有一位未知课表成员（无任何录入）与一位已确认无课成员（AV-03）
const VIEWER = "00000000-0000-4000-8000-0000000000a1";
const MEMBER = "00000000-0000-4000-8000-0000000000b2";
const CUSTOM = "00000000-0000-4000-8000-0000000000c3";
const UNKNOWN = "00000000-0000-4000-8000-0000000000d4";
const CONFIRMED = "00000000-0000-4000-8000-0000000000e5";
let groupId = "";
let uibeGroupId = "";
let memberMeetingId = "";

beforeAll(async () => {
  // All migrations run in an ephemeral PostgreSQL engine; DATABASE_URL is never used.
  const journal = JSON.parse(await readFile(new URL("../../../drizzle/meta/_journal.json", import.meta.url), "utf8"));
  for (const entry of journal.entries) {
    await client.exec(await readFile(new URL(`../../../drizzle/${entry.tag}.sql`, import.meta.url), "utf8"));
  }
  mocks.getDatabase.mockReturnValue(database);

  const [groupSemester, memberSemester, customSemester] = await database.insert(schema.semesters).values([
    { school: "PKU", academicYear: "2026–2027", semester: "秋季学期", startDate: "2026-09-07", weekCount: 16, scheduleId: "pku" },
    { school: "uibe", academicYear: "2026–2027", semester: "秋季学期", startDate: "2026-09-14", weekCount: 16, scheduleId: "uibe" },
    { school: "custom", academicYear: "2026–2027", semester: "秋季学期", startDate: "2026-09-07", weekCount: 16, scheduleId: "custom" },
  ]).returning();

  await database.insert(schema.users).values([
    { id: VIEWER, email: "av01-viewer@example.com", nickname: "查看者", defaultPrivacyLevel: 2, scheduleId: "pku" },
    { id: MEMBER, email: "av01-member@example.com", nickname: "外贸成员", defaultPrivacyLevel: 2, scheduleId: "uibe" },
    { id: CUSTOM, email: "av02-custom@example.com", nickname: "自定义作息", defaultPrivacyLevel: 2, scheduleId: "custom" },
    { id: UNKNOWN, email: "av03-unknown@example.com", nickname: "未录入成员", defaultPrivacyLevel: 2, scheduleId: "pku" },
    { id: CONFIRMED, email: "av03-confirmed@example.com", nickname: "确认无课成员", defaultPrivacyLevel: 2, scheduleId: "pku" },
  ]);

  const [group] = await database.insert(schema.groups).values({
    name: "AV-01 回归群", inviteCode: "av01group", ownerId: VIEWER, semesterId: groupSemester.id,
  }).returning();
  groupId = group.id;
  const [uibeGroup] = await database.insert(schema.groups).values({
    name: "TIME-01 外贸群", inviteCode: "time01uibe", ownerId: VIEWER, semesterId: memberSemester.id,
  }).returning();
  uibeGroupId = uibeGroup.id;
  await database.insert(schema.groupMembers).values([
    { groupId: group.id, userId: VIEWER }, { groupId: group.id, userId: MEMBER },
    { groupId: group.id, userId: CUSTOM }, { groupId: group.id, userId: UNKNOWN },
    { groupId: group.id, userId: CONFIRMED },
    { groupId: uibeGroup.id, userId: VIEWER }, { groupId: uibeGroup.id, userId: MEMBER },
  ]);

  // 成员的课表在其自己学校的学期里；周一第 1–2 小节（08:00–09:30），第 1–3 周上课
  const [course] = await database.insert(schema.courses).values({
    userId: MEMBER, semesterId: memberSemester.id, name: "测试课程",
  }).returning();
  const [meeting] = await database.insert(schema.courseMeetings).values({
    courseId: course.id, weekday: 1, startPeriod: 1, endPeriod: 2, weeks: [1, 2, 3],
  }).returning();
  memberMeetingId = meeting.id;
  // 成员在自己的第 1 周标记了「不去」
  await database.insert(schema.courseExceptions).values({
    courseMeetingId: meeting.id, userId: MEMBER, week: 1, type: "SKIP",
  });
  // 自定义作息成员的网格在其本人名下（SCH-01）：第 3 小节为 12:10–12:50（落在北大网格行之间的午间）
  await database.insert(schema.customSchedules).values({
    userId: CUSTOM, academicYear: customSemester.academicYear, semester: customSemester.semester,
    scheduleRows: [
      { start: "08:00", end: "08:50" },
      { start: "10:10", end: "12:00" },
      { start: "12:10", end: "12:50" },
      { start: "13:10", end: "14:00" },
    ],
  });
  // 自定义作息成员在午间 12:10–12:50（自己网格的第 3 小节）有私人忙碌
  await database.insert(schema.busyBlocks).values({
    userId: CUSTOM, semesterId: customSemester.id, kind: "ONE_TIME", title: null,
    weekday: 1, startPeriod: 3, endPeriod: 3, weeks: [2, 3],
  });
  // 已确认无课成员在自己的学期（北大同学期）显式确认过无课
  await database.insert(schema.semesterConfirmations).values({
    userId: CONFIRMED, semesterId: groupSemester.id,
  });
}, 30_000);

afterAll(async () => client.close());

describe("群组共同空闲按成员自己的教学周匹配「不去」（AV-01）", () => {
  it("群第 2 周 = 成员第 1 周：跳过生效，被选成员空闲", async () => {
    const availability = await getGroupAvailability(VIEWER, groupId, 2, [MEMBER]);
    expect(availability.slots.monday["1"]).toMatchObject({ commonFree: true, freeCount: 1 });

    const details = await getGroupAvailabilityDetails(VIEWER, groupId, 2, "monday", 1, [MEMBER]);
    expect(details.details.find((detail) => detail.userId === MEMBER)).toMatchObject({ free: true });
  });

  it("群第 3 周 = 成员第 2 周：课程照常忙碌，不再被其他周的跳过影响", async () => {
    const availability = await getGroupAvailability(VIEWER, groupId, 3, [MEMBER]);
    expect(availability.slots.monday["1"]).toMatchObject({ commonFree: false, freeCount: 0 });

    const details = await getGroupAvailabilityDetails(VIEWER, groupId, 3, "monday", 1, [MEMBER]);
    expect(details.details.find((detail) => detail.userId === MEMBER)).toMatchObject({ free: false, label: "测试课程" });
  });

  it("午间忙碌把共同空档按钟点切开，不再被相邻空闲格子跨越（AV-02）", async () => {
    // 成员课程 08:00–09:30，自定义作息成员 12:10–12:50 忙碌；显示轴 = 北大网格 08:00–21:30
    const availability = await getGroupAvailability(VIEWER, groupId, 3, [MEMBER, CUSTOM]);
    expect(availability.freeIntervals.monday).toEqual([
      { startMin: 570, endMin: 730 },
      { startMin: 770, endMin: 1290 },
    ]);
    // 旧按节次拼接的行为会给出跨过 12:10–12:50 的单一空档
    for (const interval of availability.freeIntervals.monday) {
      expect(interval.startMin < 730 && interval.endMin > 730).toBe(false);
      expect(interval.startMin < 770 && interval.endMin > 770).toBe(false);
    }
  });

  it("忙碌所在周之外，同一时段恢复为完整空闲（AV-02）", async () => {
    // 自定义成员的忙碌只在第 2、3 周；第 4 周午间不再切开
    const availability = await getGroupAvailability(VIEWER, groupId, 4, [MEMBER, CUSTOM]);
    expect(availability.freeIntervals.monday).toEqual([{ startMin: 570, endMin: 1290 }]);
  });

  it("未知课表成员不再被算作全天空闲（AV-03）", async () => {
    // 第 3 周成员课程 08:00–09:30；第 1 节成员忙碌、第 3 节成员空闲
    const availability = await getGroupAvailability(VIEWER, groupId, 3, [MEMBER, UNKNOWN]);
    expect(availability.unknownCount).toBe(1);
    expect(availability.slots.monday["1"]).toMatchObject({ commonFree: false, freeCount: 0, unknownCount: 1 });
    expect(availability.slots.monday["3"]).toMatchObject({ commonFree: false, freeCount: 1, unknownCount: 1 });
    // 空档仍按已录入成员计算，但接口明示有未知成员存在
    expect(availability.freeIntervals.monday).toEqual([{ startMin: 570, endMin: 1290 }]);

    const details = await getGroupAvailabilityDetails(VIEWER, groupId, 3, "monday", 3, [MEMBER, UNKNOWN]);
    expect(details.unknownCount).toBe(1);
    expect(details.commonFree).toBe(false);
    expect(details.details.find((detail) => detail.userId === UNKNOWN)).toMatchObject({ free: false, unknown: true });
    expect(details.details.find((detail) => detail.userId === MEMBER)).toMatchObject({ free: true });
    expect(details.details.find((detail) => detail.userId === MEMBER)?.unknown).toBeFalsy();
  });

  it("已确认无课的成员按有空参与，可与其他成员共同空闲（AV-03）", async () => {
    const availability = await getGroupAvailability(VIEWER, groupId, 3, [CONFIRMED]);
    expect(availability.unknownCount).toBe(0);
    expect(availability.slots.monday["3"]).toMatchObject({ commonFree: true, freeCount: 1, unknownCount: 0 });

    const details = await getGroupAvailabilityDetails(VIEWER, groupId, 3, "monday", 3, [CONFIRMED]);
    expect(details.unknownCount).toBe(0);
    expect(details.commonFree).toBe(true);
    expect(details.details.find((detail) => detail.userId === CONFIRMED)).toMatchObject({ free: true });
    expect(details.details.find((detail) => detail.userId === CONFIRMED)?.unknown).toBeFalsy();
  });

  it("仅有忙碌记录也属于已录入状态，忙碌照常参与计算（AV-03）", async () => {
    const availability = await getGroupAvailability(VIEWER, groupId, 3, [CUSTOM]);
    expect(availability.unknownCount).toBe(0);
    // 自定义成员第 3 周在 12:10–12:50 忙碌
    expect(availability.freeIntervals.monday).toEqual([
      { startMin: 480, endMin: 730 },
      { startMin: 770, endMin: 1290 },
    ]);
  });

  it("群组成员完整度按各自学校学期统计（AV-04）", async () => {
    const groups = await listGroupsForUser(VIEWER);
    const group = groups.find((item) => item.id === groupId);
    expect(group).toBeDefined();
    const memberById = new Map(group!.members.map((member) => [member.id, member]));
    // 外贸成员的课在自己学校的学期行里，也能被数到；不再误标「未录入」
    expect(memberById.get(MEMBER)).toMatchObject({ courseCount: 1, scheduleState: "recorded" });
    // 仅有忙碌记录属于已录入；未知与确认无课各自成态
    expect(memberById.get(CUSTOM)).toMatchObject({ courseCount: 0, scheduleState: "recorded" });
    expect(memberById.get(UNKNOWN)).toMatchObject({ courseCount: 0, scheduleState: "unrecorded" });
    expect(memberById.get(CONFIRMED)).toMatchObject({ courseCount: 0, scheduleState: "confirmedEmpty" });
  });

  it("非北大群的网格、详情和空档共用服务端的群组钟点轴（TIME-01）", async () => {
    // 群第 2 周 = 外贸成员第 2 周，课程 08:00–09:30 生效；外贸第 1 小节止于 08:45。
    const availability = await getGroupAvailability(VIEWER, uibeGroupId, 2, [MEMBER]);
    expect(availability.gridRows[0]).toEqual({
      period: 1,
      label: "群组第 1 节",
      timeText: "08:00–08:45",
      startMin: 480,
      endMin: 525,
    });
    expect(availability.gridRows.at(-1)).toMatchObject({ timeText: "20:00–20:50", endMin: 1250 });
    expect(availability.slots.monday["1"]).toMatchObject({ commonFree: false, freeCount: 0 });
    expect(availability.freeIntervals.monday).toEqual([{ startMin: 570, endMin: 1250 }]);

    const details = await getGroupAvailabilityDetails(VIEWER, uibeGroupId, 2, "monday", 1, [MEMBER]);
    expect(details.gridRow).toEqual(availability.gridRows[0]);
    expect(details.details.find((detail) => detail.userId === MEMBER)).toMatchObject({ free: false, label: "测试课程" });
  });

  it("批量替换不去周次后，个人课表与跨校群组结果保持一致", async () => {
    await expect(replaceMeetingSkips(VIEWER, memberMeetingId, [2])).rejects.toMatchObject({ status: 404 });
    await expect(replaceMeetingSkips(MEMBER, memberMeetingId, [4])).rejects.toMatchObject({ status: 400 });

    await replaceMeetingSkips(MEMBER, memberMeetingId, [2, 3]);
    const personalWeek1 = await getMySchedule(MEMBER, 1);
    const personalWeek2 = await getMySchedule(MEMBER, 2);
    const personalWeek3 = await getMySchedule(MEMBER, 3);
    expect(personalWeek1.courses[0].meetings[0]).toMatchObject({ skippedThisWeek: false, skippedWeeks: [2, 3] });
    expect(personalWeek2.courses[0].meetings[0]).toMatchObject({ skippedThisWeek: true, skippedWeeks: [2, 3] });
    expect(personalWeek3.courses[0].meetings[0]).toMatchObject({ skippedThisWeek: true, skippedWeeks: [2, 3] });

    // 群组比成员早一周开学：群第 2/3/4 周分别对应成员第 1/2/3 周。
    expect((await getGroupAvailability(VIEWER, groupId, 2, [MEMBER])).slots.monday["1"])
      .toMatchObject({ commonFree: false, freeCount: 0 });
    expect((await getGroupAvailability(VIEWER, groupId, 3, [MEMBER])).slots.monday["1"])
      .toMatchObject({ commonFree: true, freeCount: 1 });
    expect((await getGroupAvailability(VIEWER, groupId, 4, [MEMBER])).slots.monday["1"])
      .toMatchObject({ commonFree: true, freeCount: 1 });

    await replaceMeetingSkips(MEMBER, memberMeetingId, []);
    expect((await getMySchedule(MEMBER, 2)).courses[0].meetings[0])
      .toMatchObject({ skippedThisWeek: false, skippedWeeks: [] });
    expect((await getGroupAvailability(VIEWER, groupId, 3, [MEMBER])).slots.monday["1"])
      .toMatchObject({ commonFree: false, freeCount: 0 });
  });
});
