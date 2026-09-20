import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { WEEKDAYS, type MemberScheduleState, type PrivacyLevel, type Weekday } from "@/src/domain/schedule";
import { commonFreeIntervals, type MinuteInterval } from "@/src/domain/free-intervals";
import { getScheduleById, scheduleFromSemester, type SchedulePreset } from "@/src/config/school-schedules";
import { getDatabase } from "@/src/server/db";
import {
  busyBlocks,
  courseExceptions,
  courseMeetings,
  courses,
  groupMembers,
  groupPrivacyOverrides,
  groups,
  semesterConfirmations,
  semesters,
  users,
} from "@/src/server/db/schema";
import { HttpError } from "@/src/server/http";
import { getUserCustomRows, memberSchoolKey } from "@/src/server/semesters/data";

const DAY_MS = 24 * 60 * 60 * 1000;

export type { MemberScheduleState };

const weekdayFromNumber: Record<number, Weekday> = {
  1: "monday",
  2: "tuesday",
  3: "wednesday",
  4: "thursday",
  5: "friday",
  6: "saturday",
  7: "sunday",
};

function toMinutes(hhmm: string) {
  const [hours, minutes] = hhmm.split(":").map(Number);
  return hours * 60 + minutes;
}

export interface BusyRange {
  startMin: number;
  endMin: number;
  /** 课程名（隐私 1 展示） */
  courseName?: string;
  /** 完整课程信息（隐私 2 展示；私人忙碌不带，一律显示「忙碌」） */
  courseFullLabel?: string;
}

export interface MemberBusyContext {
  userId: string;
  nickname: string;
  defaultPrivacyLevel: PrivacyLevel;
  ranges: Record<Weekday, BusyRange[]>;
  /** 成员作息行；超出群组作息覆盖范围时可生成钟点追加行 */
  scheduleRows: ScheduleTimeRow[];
  state: MemberScheduleState;
}
interface ScheduleTimeRow { startMin: number; endMin: number; timeText: string }

// 把成员的会议/私人忙碌换算成「群查看周各天的分钟区间」。
// 跨校的正确性在这里成立：日期按各自学校开学日对齐到周次，节次按各自学校作息换算成钟点。
export function buildMemberRanges(options: {
  memberSchedule: SchedulePreset;
  memberStartDate: string;
  memberWeekCount: number;
  groupStartDate: string;
  viewWeek: number;
  meetings: { id: string; weekday: number; startPeriod: number; endPeriod: number; weeks: number[]; courseName?: string; courseFullLabel?: string }[];
  busyBlocks: { weekday: number; startPeriod: number; endPeriod: number; weeks: number[] }[];
  /** 课程时段 ID → 「不去」的成员教学周集合；跳过只作用于对应周 */
  skipsByMeeting: Map<string, Set<number>>;
}): { ranges: Record<Weekday, BusyRange[]>; scheduleRows: ScheduleTimeRow[] } {
  const { memberSchedule, memberStartDate, memberWeekCount, groupStartDate, viewWeek } = options;
  const base = Date.parse(`${groupStartDate}T00:00:00Z`);
  const memberBase = Date.parse(`${memberStartDate}T00:00:00Z`);
  const ranges = emptyRanges();
  const scheduleRows: ScheduleTimeRow[] = memberSchedule.rows
    .map((row) => ({ startMin: toMinutes(row.start), endMin: toMinutes(row.end), timeText: row.start + "–" + row.end }));
  if (Number.isNaN(base) || Number.isNaN(memberBase)) return { ranges, scheduleRows };

  for (let weekdayIndex = 0; weekdayIndex < 7; weekdayIndex += 1) {
    const dayStart = base + ((viewWeek - 1) * 7 + weekdayIndex) * DAY_MS;
    const week = Math.floor((dayStart - memberBase) / (7 * DAY_MS)) + 1;
    if (week < 1 || week > memberWeekCount) continue;
    const weekday = WEEKDAYS[weekdayIndex];
    for (const meeting of options.meetings) {
      if (meeting.weekday !== weekdayIndex + 1 || !meeting.weeks.includes(week)) continue;
      if (options.skipsByMeeting.get(meeting.id)?.has(week)) continue;
      const start = memberSchedule.rows[meeting.startPeriod - 1];
      const end = memberSchedule.rows[meeting.endPeriod - 1];
      if (!start || !end) continue;
      ranges[weekday].push({
        startMin: toMinutes(start.start),
        endMin: toMinutes(end.end),
        courseName: meeting.courseName,
        courseFullLabel: meeting.courseFullLabel,
      });
    }
    for (const block of options.busyBlocks) {
      if (block.weekday !== weekdayIndex + 1 || !block.weeks.includes(week)) continue;
      const start = memberSchedule.rows[block.startPeriod - 1];
      const end = memberSchedule.rows[block.endPeriod - 1];
      if (!start || !end) continue;
      ranges[weekday].push({ startMin: toMinutes(start.start), endMin: toMinutes(end.end) });
    }
  }
  return { ranges, scheduleRows };
}

export interface GridRow {
  period: number;
  label: string;
  timeText: string;
  startMin: number;
  endMin: number;
}

// 群展示网格以群组学期的作息为唯一基准；成员日程超出该作息覆盖范围时，
// 追加以钟点标注的额外行（去重、按时间排序、最多 4 行，且必须有人才保留）。
function buildDisplayGrid(groupSchedule: Pick<SchedulePreset, "rows">, members: MemberBusyContext[]): GridRow[] {
  const base: GridRow[] = groupSchedule.rows.map((row, index) => ({
    period: index + 1,
    label: row.label ?? "群组第 " + (index + 1) + " 节",
    timeText: row.start + "–" + row.end,
    startMin: toMinutes(row.start),
    endMin: toMinutes(row.end),
  }));
  const baseLastEnd = base[base.length - 1].endMin;

  const candidates = new Map<string, { startMin: number; endMin: number; timeText: string }>();
  for (const member of members) {
    for (const row of member.scheduleRows) {
      if (row.endMin <= baseLastEnd) continue;
      const startMin = Math.max(row.startMin, baseLastEnd);
      const candidate = { startMin, endMin: row.endMin, timeText: toClock(startMin) + "–" + toClock(row.endMin) };
      candidates.set(candidate.startMin + "-" + candidate.endMin, candidate);
    }
  }
  const extras = [...candidates.values()]
    .sort((a, b) => a.startMin - b.startMin)
    .filter((row) => members.some((member) =>
      WEEKDAYS.some((day) => member.ranges[day].some((range) => intersects(row.startMin, row.endMin, range.startMin, range.endMin)))))
    .slice(0, 4)
    .map((row, index) => ({
      period: base.length + index + 1,
      label: "",
      timeText: row.timeText,
      startMin: row.startMin,
      endMin: row.endMin,
    }));
  return [...base, ...extras];
}

function toClock(minutes: number) {
  return String(Math.floor(minutes / 60)).padStart(2, "0") + ":" + String(minutes % 60).padStart(2, "0");
}

function intersects(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}

function emptyRanges(): Record<Weekday, BusyRange[]> {
  return WEEKDAYS.reduce((acc, day) => {
    acc[day] = [];
    return acc;
  }, {} as Record<Weekday, BusyRange[]>);
}

interface GroupScheduleData {
  groupSchedule: SchedulePreset;
  members: MemberBusyContext[];
  privacyByUserId: Record<string, PrivacyLevel>;
}

async function loadAuthorizedGroupSchedule(
  viewerId: string,
  groupId: string,
  selectedUserIds: string[],
  viewWeek: number,
): Promise<GroupScheduleData> {
  const db = getDatabase();
  const [membership] = await db
    .select({
      semesterId: groups.semesterId,
      ownerId: groups.ownerId,
      archivedAt: groups.archivedAt,
      groupScheduleId: semesters.scheduleId,
      groupCustomSchedule: semesters.customSchedule,
      groupStartDate: semesters.startDate,
      groupAcademicYear: semesters.academicYear,
      groupSemester: semesters.semester,
      groupWeekCount: semesters.weekCount,
    })
    .from(groupMembers)
    .innerJoin(groups, eq(groupMembers.groupId, groups.id))
    .innerJoin(semesters, eq(groups.semesterId, semesters.id))
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, viewerId)))
    .limit(1);

  if (!membership) throw new HttpError(404, "群组不存在或你不是群组成员");
  if (membership.archivedAt) throw new HttpError(410, "群组已归档，请先在群组页恢复");
  // 查看周由群组学期的实际周数驱动（SCH-02）
  if (viewWeek > membership.groupWeekCount) {
    throw new HttpError(400, `教学周超出本学期范围（1–${membership.groupWeekCount} 周）`);
  }
  // 自定义群组的网格跟随群主自己的作息（SCH-01）；历史共享列仅作兜底
  const groupCustomRows = membership.groupScheduleId === "custom"
    ? await getUserCustomRows(membership.ownerId, membership.groupAcademicYear, membership.groupSemester)
      ?? membership.groupCustomSchedule
    : null;
  const groupSchedule: SchedulePreset = groupCustomRows?.length
    ? scheduleFromSemester({ scheduleId: "custom", customSchedule: groupCustomRows })
    : getScheduleById(membership.groupScheduleId);

  const memberRows = await db
    .select({
      id: users.id,
      nickname: users.nickname,
      email: users.email,
      defaultPrivacyLevel: users.defaultPrivacyLevel,
      userScheduleId: users.scheduleId,
    })
    .from(groupMembers)
    .innerJoin(users, eq(groupMembers.userId, users.id))
    .where(and(eq(groupMembers.groupId, groupId), inArray(groupMembers.userId, selectedUserIds)));

  if (memberRows.length !== new Set(selectedUserIds).size) {
    throw new HttpError(400, "所选成员不属于当前群组");
  }

  const privacyByUserId = Object.fromEntries(
    (
      await db
        .select()
        .from(groupPrivacyOverrides)
        .where(and(eq(groupPrivacyOverrides.groupId, groupId), inArray(groupPrivacyOverrides.userId, selectedUserIds)))
    ).map((override) => [override.userId, override.privacyLevel as PrivacyLevel]),
  );

  // 每位成员各自学校的学期（同学年/同学期名称），课表数据从各自的学期读取
  const members = await Promise.all(
    memberRows.map(async (member) => {
      const preset = getScheduleById(member.userScheduleId);
      // 成员学期按自己学校的作息定位（与群组完整度统计共用 memberSchoolKey 规则，AV-04）
      const [memberSemester] = await db
        .select({
          id: semesters.id,
          startDate: semesters.startDate,
          weekCount: semesters.weekCount,
          scheduleId: semesters.scheduleId,
          academicYear: semesters.academicYear,
          semester: semesters.semester,
        })
        .from(semesters)
        .where(and(
          eq(semesters.school, memberSchoolKey(member.userScheduleId)),
          eq(semesters.academicYear, membership.groupAcademicYear),
          eq(semesters.semester, membership.groupSemester),
        ))
        .limit(1);

      if (!memberSemester) {
        // 成员在该学期没有任何学期行：课表状态未知，不计入有空结论
        return {
          userId: member.id,
          nickname: member.nickname,
          defaultPrivacyLevel: member.defaultPrivacyLevel as PrivacyLevel,
          ranges: emptyRanges(),
          scheduleRows: [],
          state: "unrecorded",
        } satisfies MemberBusyContext;
      }

      const courseRows = await db
        .select({ id: courses.id, name: courses.name, location: courses.location, instructor: courses.instructor })
        .from(courses)
        .where(and(eq(courses.userId, member.id), eq(courses.semesterId, memberSemester.id)));
      const courseById = new Map(courseRows.map((course) => [course.id, course]));
      const meetingRows = courseRows.length
        ? await db.select().from(courseMeetings).where(inArray(courseMeetings.courseId, courseRows.map((course) => course.id)))
        : [];
      const exceptionRows = meetingRows.length
        ? await db
            .select({ courseMeetingId: courseExceptions.courseMeetingId, week: courseExceptions.week })
            .from(courseExceptions)
            .where(and(
              eq(courseExceptions.userId, member.id),
              inArray(courseExceptions.courseMeetingId, meetingRows.map((meeting) => meeting.id)),
            ))
        : [];
      const busyRows = await db
        .select()
        .from(busyBlocks)
        .where(and(eq(busyBlocks.userId, member.id), eq(busyBlocks.semesterId, memberSemester.id)));
      // 未知 ≠ 无课：只有成员录入过数据（课程或忙碌）或显式确认过，才能按已知参与计算
      const [confirmation] = await db
        .select({ userId: semesterConfirmations.userId })
        .from(semesterConfirmations)
        .where(and(eq(semesterConfirmations.userId, member.id), eq(semesterConfirmations.semesterId, memberSemester.id)))
        .limit(1);
      const state: MemberScheduleState = courseRows.length || busyRows.length
        ? "recorded"
        : confirmation
          ? "confirmedEmpty"
          : "unrecorded";

      // 成员自定义作息读其本人名下的网格（SCH-01）；没有则按所选学校预设
      const memberCustomRows = member.userScheduleId === "custom"
        ? await getUserCustomRows(member.id, memberSemester.academicYear, memberSemester.semester)
        : null;
      const memberSchedule: SchedulePreset = memberCustomRows?.length
        ? scheduleFromSemester({ scheduleId: "custom", customSchedule: memberCustomRows })
        : preset;


      // 「不去」按成员自己学期的教学周记录；buildMemberRanges 先把群查看日期
      // 换算成成员教学周，再按周匹配，单周跳过不影响其他周。
      const skipsByMeeting = new Map<string, Set<number>>();
      for (const exception of exceptionRows) {
        const weeks = skipsByMeeting.get(exception.courseMeetingId);
        if (weeks) weeks.add(exception.week);
        else skipsByMeeting.set(exception.courseMeetingId, new Set([exception.week]));
      }

      const built = buildMemberRanges({
        memberSchedule: memberSchedule,
        memberStartDate: memberSemester.startDate,
        memberWeekCount: memberSemester.weekCount,
        groupStartDate: membership.groupStartDate,
        viewWeek,
        meetings: meetingRows.map((meeting) => {
          const course = courseById.get(meeting.courseId);
          return {
            id: meeting.id,
            weekday: meeting.weekday,
            startPeriod: meeting.startPeriod,
            endPeriod: meeting.endPeriod,
            weeks: meeting.weeks,
            courseName: course?.name,
            courseFullLabel: course
              ? [course.name, course.location ?? "", course.instructor ?? ""].filter(Boolean).join(" · ")
              : undefined,
          };
        }),
        busyBlocks: busyRows.map((block) => ({
          weekday: block.weekday,
          startPeriod: block.startPeriod,
          endPeriod: block.endPeriod,
          weeks: block.weeks,
        })),
        skipsByMeeting,
      });

      return {
        userId: member.id,
        nickname: member.nickname,
        defaultPrivacyLevel: member.defaultPrivacyLevel as PrivacyLevel,
        ranges: built.ranges,
        scheduleRows: built.scheduleRows,
        state,
      } satisfies MemberBusyContext;
    }),
  );

  return { groupSchedule, members, privacyByUserId };
}

export async function getGroupAvailability(
  viewerId: string,
  groupId: string,
  week: number,
  selectedUserIds: string[],
) {
  const { groupSchedule, members } = await loadAuthorizedGroupSchedule(viewerId, groupId, selectedUserIds, week);
  const gridRows = buildDisplayGrid(groupSchedule, members);
  // 未知成员（未录入且未确认无课）不计入有空结论，避免传递过强确定性（AV-03）
  const knownMembers = members.filter((member) => member.state !== "unrecorded");
  const unknownCount = members.length - knownMembers.length;
  const slots: Record<string, Record<string, { commonFree: boolean; freeCount: number; selectedUsers: number; unknownCount: number }>> = {};

  for (const weekday of WEEKDAYS) {
    slots[weekday] = {};
    for (const row of gridRows) {
      const rowStart = row.startMin;
      const rowEnd = row.endMin;
      const freeCount = knownMembers.filter(
        (member) => !member.ranges[weekday].some((range) => intersects(rowStart, rowEnd, range.startMin, range.endMin)),
      ).length;
      slots[weekday][String(row.period)] = {
        commonFree: selectedUserIds.length > 0 && unknownCount === 0 && freeCount === members.length,
        freeCount,
        selectedUsers: selectedUserIds.length,
        unknownCount,
      };
    }
  }

  // 共同空档按真实钟点轴计算：已录入成员忙碌并集在显示网格范围内的补集，
  // 网格行之间的午间/课间同样经过检查，不会被相邻空闲格子跨越（AV-02）。
  const axisStart = Math.min(...gridRows.map((row) => row.startMin));
  const axisEnd = Math.max(...gridRows.map((row) => row.endMin));
  const freeIntervals = {} as Record<Weekday, MinuteInterval[]>;
  for (const weekday of WEEKDAYS) {
    const busy = knownMembers.flatMap((member) =>
      member.ranges[weekday].map((range) => ({ startMin: range.startMin, endMin: range.endMin })));
    freeIntervals[weekday] = selectedUserIds.length > 0 && knownMembers.length > 0
      ? commonFreeIntervals(busy, axisStart, axisEnd)
      : [];
  }

  return {
    week,
    selectedUsers: selectedUserIds.length,
    unknownCount,
    slots,
    freeIntervals,
    gridRows: gridRows.map((row) => ({ period: row.period, label: row.label, timeText: row.timeText, startMin: row.startMin, endMin: row.endMin })),
  };
}

export async function getGroupAvailabilityDetails(
  viewerId: string,
  groupId: string,
  week: number,
  weekday: Weekday,
  period: number,
  selectedUserIds: string[],
) {
  const { groupSchedule, members, privacyByUserId } = await loadAuthorizedGroupSchedule(
    viewerId,
    groupId,
    selectedUserIds,
    week,
  );
  const gridRows = buildDisplayGrid(groupSchedule, members);
  const row = gridRows[period - 1];
  if (!row) throw new HttpError(400, "节次超出网格范围");
  const rowStart = row.startMin;
  const rowEnd = row.endMin;

  const details = members.map((member) => {
    if (member.state === "unrecorded") {
      return { userId: member.userId, nickname: member.nickname, free: false, unknown: true };
    }
    const busyRange = member.ranges[weekday].find((range) => intersects(rowStart, rowEnd, range.startMin, range.endMin));
    if (!busyRange) return { userId: member.userId, nickname: member.nickname, free: true };
    // 私人忙碌没有标题；课程信息按隐私级别投影（本人始终可见完整信息）
    if (member.userId === viewerId) {
      return { userId: member.userId, nickname: member.nickname, free: false, label: busyRange.courseFullLabel ?? "忙碌" };
    }
    const privacy = privacyByUserId[member.userId] ?? member.defaultPrivacyLevel;
    if (privacy === 0 || !busyRange.courseName) return { userId: member.userId, nickname: member.nickname, free: false, label: "忙碌" };
    return {
      userId: member.userId,
      nickname: member.nickname,
      free: false,
      label: privacy === 1 ? busyRange.courseName : busyRange.courseFullLabel ?? busyRange.courseName,
    };
  });

  const freeCount = details.filter((detail) => detail.free).length;
  const unknownCount = details.filter((detail) => detail.unknown).length;
  return {
    week,
    weekday,
    period,
    commonFree: selectedUserIds.length > 0 && unknownCount === 0 && freeCount === details.length,
    freeCount,
    selectedUsers: selectedUserIds.length,
    unknownCount,
    gridRow: { period: row.period, label: row.label, timeText: row.timeText, startMin: row.startMin, endMin: row.endMin },
    details,
  };
}
