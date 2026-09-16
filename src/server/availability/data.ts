import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { WEEKDAYS, type PrivacyLevel, type Weekday } from "@/src/domain/schedule";
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
  semesters,
  users,
} from "@/src/server/db/schema";
import { HttpError } from "@/src/server/http";

const DAY_MS = 24 * 60 * 60 * 1000;

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
  /** 成员作息里晚于北大 12 节的行（钟点标注追加行的候选） */
  lateRows: LateRow[];
}
interface LateRow { startMin: number; endMin: number; timeText: string }

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
  skippedMeetingIds: Set<string>;
}): { ranges: Record<Weekday, BusyRange[]>; lateRows: LateRow[] } {
  const { memberSchedule, memberStartDate, memberWeekCount, groupStartDate, viewWeek } = options;
  const base = Date.parse(`${groupStartDate}T00:00:00Z`);
  const memberBase = Date.parse(`${memberStartDate}T00:00:00Z`);
  const ranges = emptyRanges();
  // 成员作息里晚于北大 12 节的行，作为群网格的「追加钟点行」候选
  const pkuLastEnd = Math.max(...PKU_GRID.rows.map((row) => toMinutes(row.end)));
  const lateRows: LateRow[] = memberSchedule.rows
    .map((row) => ({ startMin: toMinutes(row.start), endMin: toMinutes(row.end), timeText: row.start + "–" + row.end }))
    .filter((row) => row.startMin >= pkuLastEnd);
  if (Number.isNaN(base) || Number.isNaN(memberBase)) return { ranges, lateRows };

  for (let weekdayIndex = 0; weekdayIndex < 7; weekdayIndex += 1) {
    const dayStart = base + ((viewWeek - 1) * 7 + weekdayIndex) * DAY_MS;
    const week = Math.floor((dayStart - memberBase) / (7 * DAY_MS)) + 1;
    if (week < 1 || week > memberWeekCount) continue;
    const weekday = WEEKDAYS[weekdayIndex];
    for (const meeting of options.meetings) {
      if (meeting.weekday !== weekdayIndex + 1 || !meeting.weeks.includes(week)) continue;
      if (options.skippedMeetingIds.has(meeting.id)) continue;
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
  return { ranges, lateRows };
}

const PKU_GRID = getScheduleById(null);

export interface GridRow {
  period: number;
  label: string;
  timeText: string;
  startMin: number;
  endMin: number;
}

// 群展示网格：统一为北大 12 节；成员日程超出北大覆盖范围（21:30 之后）时，
// 追加以钟点标注的额外行（去重、按时间排序、最多 4 行，且必须有人才保留）。
function buildDisplayGrid(members: MemberBusyContext[]): GridRow[] {
  const base: GridRow[] = PKU_GRID.rows.map((row, index) => ({
    period: index + 1,
    label: "第 " + (index + 1) + " 节",
    timeText: row.start + "–" + row.end,
    startMin: toMinutes(row.start),
    endMin: toMinutes(row.end),
  }));
  const pkuLastEnd = base[base.length - 1].endMin;

  const candidates = new Map<string, { startMin: number; endMin: number; timeText: string }>();
  for (const member of members) {
    for (const row of member.lateRows) {
      if (row.startMin < pkuLastEnd) continue;
      candidates.set(row.startMin + "-" + row.endMin, row);
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
      groupScheduleId: semesters.scheduleId,
      groupCustomSchedule: semesters.customSchedule,
      groupStartDate: semesters.startDate,
      groupAcademicYear: semesters.academicYear,
      groupSemester: semesters.semester,
    })
    .from(groupMembers)
    .innerJoin(groups, eq(groupMembers.groupId, groups.id))
    .innerJoin(semesters, eq(groups.semesterId, semesters.id))
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, viewerId)))
    .limit(1);

  if (!membership) throw new HttpError(404, "群组不存在或你不是群组成员");
  const groupSchedule: SchedulePreset = membership.groupCustomSchedule?.length
    ? scheduleFromSemester({ scheduleId: "custom", customSchedule: membership.groupCustomSchedule })
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
      const isCustom = member.userScheduleId === "custom";
      const preset = getScheduleById(member.userScheduleId);
      const schoolKey = isCustom ? "custom" : preset.id === "pku" ? "PKU" : preset.id;
      const [memberSemester] = await db
        .select({ id: semesters.id, startDate: semesters.startDate, weekCount: semesters.weekCount, scheduleId: semesters.scheduleId, customSchedule: semesters.customSchedule })
        .from(semesters)
        .where(and(
          eq(semesters.school, schoolKey),
          eq(semesters.academicYear, membership.groupAcademicYear),
          eq(semesters.semester, membership.groupSemester),
        ))
        .limit(1);

      if (!memberSemester) {
        // 成员尚未在该学期录入任何课表：按全天空闲计算
        return {
          userId: member.id,
          nickname: member.nickname,
          defaultPrivacyLevel: member.defaultPrivacyLevel as PrivacyLevel,
          ranges: emptyRanges(),
          lateRows: [],
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
            .select({ courseMeetingId: courseExceptions.courseMeetingId })
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

      const memberSchedule: SchedulePreset = memberSemester.customSchedule?.length
        ? scheduleFromSemester({ scheduleId: "custom", customSchedule: memberSemester.customSchedule })
        : preset;


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
        skippedMeetingIds: new Set(exceptionRows.map((exception) => exception.courseMeetingId)),
      });

      return {
        userId: member.id,
        nickname: member.nickname,
        defaultPrivacyLevel: member.defaultPrivacyLevel as PrivacyLevel,
        ranges: built.ranges,
        lateRows: built.lateRows,
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
  const { members } = await loadAuthorizedGroupSchedule(viewerId, groupId, selectedUserIds, week);
  const gridRows = buildDisplayGrid(members);
  const slots: Record<string, Record<string, { commonFree: boolean; freeCount: number; selectedUsers: number }>> = {};

  for (const weekday of WEEKDAYS) {
    slots[weekday] = {};
    for (const row of gridRows) {
      const rowStart = row.startMin;
      const rowEnd = row.endMin;
      const freeCount = members.filter(
        (member) => !member.ranges[weekday].some((range) => intersects(rowStart, rowEnd, range.startMin, range.endMin)),
      ).length;
      slots[weekday][String(row.period)] = {
        commonFree: selectedUserIds.length > 0 && freeCount === selectedUserIds.length,
        freeCount,
        selectedUsers: selectedUserIds.length,
      };
    }
  }

  return {
    week,
    selectedUsers: selectedUserIds.length,
    slots,
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
  const { members, privacyByUserId } = await loadAuthorizedGroupSchedule(
    viewerId,
    groupId,
    selectedUserIds,
    week,
  );
  const gridRows = buildDisplayGrid(members);
  const row = gridRows[period - 1];
  if (!row) throw new HttpError(400, "节次超出网格范围");
  const rowStart = row.startMin;
  const rowEnd = row.endMin;

  const details = members.map((member) => {
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
  return {
    week,
    weekday,
    period,
    commonFree: selectedUserIds.length > 0 && freeCount === selectedUserIds.length,
    freeCount,
    selectedUsers: selectedUserIds.length,
    details,
  };
}
