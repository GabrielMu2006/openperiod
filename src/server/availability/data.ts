import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { calculateAvailabilitySlot } from "@/src/domain/availability";
import { WEEKDAYS, type PrivacyLevel, type ScheduleDataset, type Weekday } from "@/src/domain/schedule";
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
import { getScheduleById } from "@/src/config/school-schedules";
import { HttpError } from "@/src/server/http";

const weekdayFromNumber: Record<number, Weekday> = {
  1: "monday",
  2: "tuesday",
  3: "wednesday",
  4: "thursday",
  5: "friday",
  6: "saturday",
  7: "sunday",
};

interface GroupScheduleData {
  dataset: ScheduleDataset;
  privacyByUserId: Record<string, PrivacyLevel>;
  periodCount: number;
}

async function loadAuthorizedGroupSchedule(
  viewerId: string,
  groupId: string,
  selectedUserIds: string[],
): Promise<GroupScheduleData> {
  const db = getDatabase();
  const [membership] = await db
    .select({ semesterId: groups.semesterId, scheduleId: semesters.scheduleId })
    .from(groupMembers)
    .innerJoin(groups, eq(groupMembers.groupId, groups.id))
    .innerJoin(semesters, eq(groups.semesterId, semesters.id))
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, viewerId)))
    .limit(1);

  if (!membership) throw new HttpError(404, "群组不存在或你不是群组成员");

  const memberRows = await db
    .select({
      id: users.id,
      nickname: users.nickname,
      email: users.email,
      defaultPrivacyLevel: users.defaultPrivacyLevel,
    })
    .from(groupMembers)
    .innerJoin(users, eq(groupMembers.userId, users.id))
    .where(and(eq(groupMembers.groupId, groupId), inArray(groupMembers.userId, selectedUserIds)));

  if (memberRows.length !== new Set(selectedUserIds).size) {
    throw new HttpError(400, "所选成员不属于当前群组");
  }

  const courseRows = await db
    .select()
    .from(courses)
    .where(and(eq(courses.semesterId, membership.semesterId), inArray(courses.userId, selectedUserIds)));

  const meetingRows = courseRows.length
    ? await db.select().from(courseMeetings).where(inArray(courseMeetings.courseId, courseRows.map((course) => course.id)))
    : [];
  const exceptionRows = meetingRows.length
    ? await db
        .select()
        .from(courseExceptions)
        .where(inArray(courseExceptions.courseMeetingId, meetingRows.map((meeting) => meeting.id)))
    : [];
  const busyRows = await db
    .select()
    .from(busyBlocks)
    .where(and(eq(busyBlocks.semesterId, membership.semesterId), inArray(busyBlocks.userId, selectedUserIds)));
  const overrideRows = await db
    .select()
    .from(groupPrivacyOverrides)
    .where(and(eq(groupPrivacyOverrides.groupId, groupId), inArray(groupPrivacyOverrides.userId, selectedUserIds)));

  const dataset: ScheduleDataset = {
    users: memberRows.map((user) => ({
      ...user,
      defaultPrivacyLevel: user.defaultPrivacyLevel as PrivacyLevel,
    })),
    courses: courseRows.map((course) => ({
      id: course.id,
      userId: course.userId,
      semesterId: course.semesterId,
      name: course.name,
      instructor: course.instructor ?? undefined,
      location: course.location ?? undefined,
      notes: course.notes ?? undefined,
    })),
    meetings: meetingRows.map((meeting) => ({
      id: meeting.id,
      courseId: meeting.courseId,
      weekday: weekdayFromNumber[meeting.weekday],
      startPeriod: meeting.startPeriod,
      endPeriod: meeting.endPeriod,
      weeks: meeting.weeks,
    })),
    exceptions: exceptionRows.map((exception) => ({
      courseMeetingId: exception.courseMeetingId,
      userId: exception.userId,
      week: exception.week,
      type: exception.type,
    })),
    busyBlocks: busyRows.map((block) => ({
      id: block.id,
      userId: block.userId,
      weekday: weekdayFromNumber[block.weekday],
      startPeriod: block.startPeriod,
      endPeriod: block.endPeriod,
      weeks: block.weeks,
      // Title intentionally excluded: availability projection never needs it.
    })),
  };

  return {
    dataset,
    privacyByUserId: Object.fromEntries(
      overrideRows.map((override) => [override.userId, override.privacyLevel as PrivacyLevel]),
    ),
    periodCount: getScheduleById(membership.scheduleId).rows.length,
  };
}

export async function getGroupAvailability(
  viewerId: string,
  groupId: string,
  week: number,
  selectedUserIds: string[],
) {
  const { dataset, privacyByUserId, periodCount } = await loadAuthorizedGroupSchedule(viewerId, groupId, selectedUserIds);
  const slots: Record<string, Record<string, { commonFree: boolean; freeCount: number; selectedUsers: number }>> = {};

  for (const weekday of WEEKDAYS) {
    slots[weekday] = {};
    for (let period = 1; period <= periodCount; period += 1) {
      const slot = calculateAvailabilitySlot(dataset, {
        week,
        weekday,
        period,
        selectedUserIds,
        viewerId,
        privacyByUserId,
      });
      slots[weekday][String(period)] = { commonFree: slot.commonFree, freeCount: slot.freeCount, selectedUsers: slot.selectedUsers };
    }
  }

  return { week, selectedUsers: selectedUserIds.length, slots };
}

export async function getGroupAvailabilityDetails(
  viewerId: string,
  groupId: string,
  week: number,
  weekday: Weekday,
  period: number,
  selectedUserIds: string[],
) {
  const { dataset, privacyByUserId } = await loadAuthorizedGroupSchedule(viewerId, groupId, selectedUserIds);
  const slot = calculateAvailabilitySlot(dataset, {
    week,
    weekday,
    period,
    selectedUserIds,
    viewerId,
    privacyByUserId,
  });

  return { week, weekday, period, ...slot };
}
