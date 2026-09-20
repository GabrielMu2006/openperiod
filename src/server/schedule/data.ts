import "server-only";
import { and, eq, inArray, notInArray } from "drizzle-orm";
import type { z } from "zod";
import type { Weekday } from "@/src/domain/schedule";
import { getDatabase } from "@/src/server/db";
import { busyBlocks, courseExceptions, courseMeetings, courses, semesterConfirmations, users } from "@/src/server/db/schema";
import { HttpError } from "@/src/server/http";
import { ensureDefaultSemester, getUserCustomRows } from "@/src/server/semesters/data";
import { scheduleFromSemester } from "@/src/config/school-schedules";

// 用户的学期跟随其学校作息；未设置学校时回落北大默认
async function ensureUserSemester(userId: string) {
  const [user] = await getDatabase()
    .select({ scheduleId: users.scheduleId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return ensureDefaultSemester(user?.scheduleId);
}
import type { busyMutationSchema, courseMutationSchema } from "./validation";
import { diffCourseMeetings } from "./meeting-diff";

type CourseInput = z.infer<typeof courseMutationSchema>;
type BusyInput = z.infer<typeof busyMutationSchema>;

const weekdayNumber: Record<Weekday, number> = {
  monday: 1, tuesday: 2, wednesday: 3, thursday: 4,
  friday: 5, saturday: 6, sunday: 7,
};

const weekdayFromNumber: Record<number, Weekday> = {
  1: "monday", 2: "tuesday", 3: "wednesday", 4: "thursday",
  5: "friday", 6: "saturday", 7: "sunday",
};

// 周次由目标学期的实际周数驱动，而不是全局硬编码（SCH-02）
function assertWeeksInSemester(weeks: number[], weekCount: number) {
  if (weeks.some((week) => week < 1 || week > weekCount)) {
    throw new HttpError(400, `周次超出本学期范围（1–${weekCount} 周）`);
  }
}

export async function getMySchedule(userId: string, requestedWeek?: number) {
  const db = getDatabase();
  const semester = await ensureUserSemester(userId);
  if (requestedWeek !== undefined && requestedWeek > semester.weekCount) {
    throw new HttpError(400, `教学周超出本学期范围（1–${semester.weekCount} 周）`);
  }
  const week = requestedWeek ?? semester.currentWeek;
  const courseRows = await db.select().from(courses)
    .where(and(eq(courses.userId, userId), eq(courses.semesterId, semester.id)));
  const meetingRows = courseRows.length
    ? await db.select().from(courseMeetings).where(inArray(courseMeetings.courseId, courseRows.map((course) => course.id)))
    : [];
  const [exceptionRows, busyRows] = await Promise.all([
    meetingRows.length
      ? db.select({ courseMeetingId: courseExceptions.courseMeetingId, week: courseExceptions.week }).from(courseExceptions)
          .where(and(eq(courseExceptions.userId, userId), inArray(courseExceptions.courseMeetingId, meetingRows.map((meeting) => meeting.id))))
      : Promise.resolve([] as { courseMeetingId: string; week: number }[]),
    db.select().from(busyBlocks)
      .where(and(eq(busyBlocks.userId, userId), eq(busyBlocks.semesterId, semester.id))),
  ]);
  const [confirmation] = await db
    .select({ confirmedAt: semesterConfirmations.confirmedAt })
    .from(semesterConfirmations)
    .where(and(eq(semesterConfirmations.userId, userId), eq(semesterConfirmations.semesterId, semester.id)))
    .limit(1);
  // 自定义作息按用户隔离：读自己的网格，而不是共享学期行上的历史列（SCH-01）
  const customRows = semester.scheduleId === "custom"
    ? await getUserCustomRows(userId, semester.academicYear, semester.semester)
    : null;
  const skipped = new Set(exceptionRows.filter((exception) => exception.week === week).map((exception) => exception.courseMeetingId));
  // 每个时段被标记「不去」的全部周次，供批量管理使用
  const skipsByMeeting = new Map<string, number[]>();
  for (const exception of exceptionRows) {
    const list = skipsByMeeting.get(exception.courseMeetingId);
    if (list) list.push(exception.week);
    else skipsByMeeting.set(exception.courseMeetingId, [exception.week]);
  }

  return {
    semester: {
      id: semester.id,
      academicYear: semester.academicYear,
      semester: semester.semester,
      currentWeek: semester.currentWeek,
      weekCount: semester.weekCount,
      startDate: semester.startDate,
      timezone: semester.timezone,
      scheduleId: semester.scheduleId,
      schedule: scheduleFromSemester({ scheduleId: semester.scheduleId, customSchedule: customRows }),
    },
    week,
    confirmedEmpty: Boolean(confirmation),
    courses: courseRows.map((course) => ({
      id: course.id,
      name: course.name,
      instructor: course.instructor ?? "",
      location: course.location ?? "",
      meetings: meetingRows.filter((meeting) => meeting.courseId === course.id).map((meeting) => ({
        id: meeting.id,
        weekday: weekdayFromNumber[meeting.weekday],
        startPeriod: meeting.startPeriod,
        endPeriod: meeting.endPeriod,
        weeks: meeting.weeks,
        skippedThisWeek: skipped.has(meeting.id),
        skippedWeeks: (skipsByMeeting.get(meeting.id) ?? []).sort((a, b) => a - b),
      })),
    })),
    busyBlocks: busyRows.map((block) => ({
      id: block.id,
      kind: block.kind,
      title: block.title ?? "",
      weekday: weekdayFromNumber[block.weekday],
      startPeriod: block.startPeriod,
      endPeriod: block.endPeriod,
      weeks: block.weeks,
    })),
  };
}

export async function createCourse(userId: string, input: CourseInput) {
  const db = getDatabase();
  const semester = await ensureUserSemester(userId);
  for (const meeting of input.meetings) assertWeeksInSemester(meeting.weeks, semester.weekCount);
  return db.transaction(async (tx) => {
    const [course] = await tx.insert(courses).values({
      userId, semesterId: semester.id, name: input.name,
      instructor: input.instructor || null, location: input.location || null,
    }).returning({ id: courses.id });
    if (!course) throw new Error("Failed to create course");
    await tx.insert(courseMeetings).values(input.meetings.map((meeting) => ({
      courseId: course.id, weekday: weekdayNumber[meeting.weekday],
      startPeriod: meeting.startPeriod, endPeriod: meeting.endPeriod, weeks: meeting.weeks,
    })));
    return { id: course.id };
  });
}

export async function updateCourse(userId: string, courseId: string, input: CourseInput) {
  const db = getDatabase();
  const semester = await ensureUserSemester(userId);
  for (const meeting of input.meetings) assertWeeksInSemester(meeting.weeks, semester.weekCount);
  await db.transaction(async (tx) => {
    const [course] = await tx.update(courses).set({
      name: input.name, instructor: input.instructor || null, location: input.location || null,
    }).where(and(eq(courses.id, courseId), eq(courses.userId, userId))).returning({ id: courses.id });
    if (!course) throw new HttpError(404, "课程不存在");

    // 智能保留：未变化的时段原样保留（含其上的「本周不去」记录），只重建真正被改动的时段
    const existingMeetings = await tx.select().from(courseMeetings).where(eq(courseMeetings.courseId, course.id));
    const diff = diffCourseMeetings(existingMeetings, input.meetings.map((meeting) => ({
      weekday: weekdayNumber[meeting.weekday],
      startPeriod: meeting.startPeriod,
      endPeriod: meeting.endPeriod,
      weeks: meeting.weeks,
    })));

    if (diff.removedIds.length) {
      await tx.delete(courseMeetings).where(inArray(courseMeetings.id, diff.removedIds));
    }
    if (diff.inserts.length) {
      await tx.insert(courseMeetings).values(diff.inserts.map((meeting) => ({
        courseId: course.id, weekday: meeting.weekday,
        startPeriod: meeting.startPeriod, endPeriod: meeting.endPeriod, weeks: meeting.weeks,
      })));
    }
  });
}

export async function deleteCourse(userId: string, courseId: string) {
  const [deleted] = await getDatabase().delete(courses)
    .where(and(eq(courses.id, courseId), eq(courses.userId, userId))).returning({ id: courses.id });
  if (!deleted) throw new HttpError(404, "课程不存在");
}

export async function setMeetingSkipped(userId: string, meetingId: string, week: number, skipped: boolean) {
  const db = getDatabase();
  const [meeting] = await db.select({ id: courseMeetings.id, weeks: courseMeetings.weeks })
    .from(courseMeetings).innerJoin(courses, eq(courseMeetings.courseId, courses.id))
    .where(and(eq(courseMeetings.id, meetingId), eq(courses.userId, userId))).limit(1);
  if (!meeting) throw new HttpError(404, "课程时段不存在");
  if (!meeting.weeks.includes(week)) throw new HttpError(400, "这门课本周没有安排");
  if (skipped) {
    await db.insert(courseExceptions).values({ courseMeetingId: meeting.id, userId, week, type: "SKIP" })
      .onConflictDoNothing({ target: [courseExceptions.courseMeetingId, courseExceptions.userId, courseExceptions.week] });
  } else {
    await db.delete(courseExceptions).where(and(
      eq(courseExceptions.courseMeetingId, meeting.id), eq(courseExceptions.userId, userId), eq(courseExceptions.week, week),
    ));
  }
}

// 批量替换某时段的「不去」周次：目标集合之外的旧标记清除，缺的补上（一次事务生效）
export async function replaceMeetingSkips(userId: string, meetingId: string, weeks: number[]) {
  const db = getDatabase();
  const [meeting] = await db.select({ id: courseMeetings.id, weeks: courseMeetings.weeks })
    .from(courseMeetings).innerJoin(courses, eq(courseMeetings.courseId, courses.id))
    .where(and(eq(courseMeetings.id, meetingId), eq(courses.userId, userId))).limit(1);
  if (!meeting) throw new HttpError(404, "课程时段不存在");
  if (weeks.some((week) => !meeting.weeks.includes(week))) throw new HttpError(400, "周次超出该时段的上课范围");
  await db.transaction(async (tx) => {
    await tx.delete(courseExceptions).where(and(
      eq(courseExceptions.courseMeetingId, meeting.id),
      eq(courseExceptions.userId, userId),
      eq(courseExceptions.type, "SKIP"),
      weeks.length ? notInArray(courseExceptions.week, weeks) : undefined,
    ));
    if (weeks.length) {
      await tx.insert(courseExceptions)
        .values(weeks.map((week) => ({ courseMeetingId: meeting.id, userId, week, type: "SKIP" as const })))
        .onConflictDoNothing({ target: [courseExceptions.courseMeetingId, courseExceptions.userId, courseExceptions.week] });
    }
  });
}

// 显式确认/取消「本学期无课」：让共同空闲能把「未知课表」和「确认无课」区分开（AV-03）
export async function setSemesterConfirmedEmpty(userId: string, confirmed: boolean) {
  const db = getDatabase();
  const semester = await ensureUserSemester(userId);
  if (confirmed) {
    await db.insert(semesterConfirmations).values({ userId, semesterId: semester.id })
      .onConflictDoNothing({ target: [semesterConfirmations.userId, semesterConfirmations.semesterId] });
  } else {
    await db.delete(semesterConfirmations)
      .where(and(eq(semesterConfirmations.userId, userId), eq(semesterConfirmations.semesterId, semester.id)));
  }
  return { confirmedEmpty: confirmed };
}

export async function createBusyBlock(userId: string, input: BusyInput) {
  const semester = await ensureUserSemester(userId);
  assertWeeksInSemester(input.weeks, semester.weekCount);
  const [block] = await getDatabase().insert(busyBlocks).values({
    userId, semesterId: semester.id, kind: input.kind, title: input.title || null,
    weekday: weekdayNumber[input.weekday], startPeriod: input.startPeriod,
    endPeriod: input.endPeriod, weeks: input.weeks,
  }).returning({ id: busyBlocks.id });
  if (!block) throw new Error("Failed to create busy block");
  return block;
}

export async function updateBusyBlock(userId: string, busyId: string, input: BusyInput) {
  const semester = await ensureUserSemester(userId);
  assertWeeksInSemester(input.weeks, semester.weekCount);
  const [block] = await getDatabase().update(busyBlocks).set({
    kind: input.kind, title: input.title || null, weekday: weekdayNumber[input.weekday],
    startPeriod: input.startPeriod, endPeriod: input.endPeriod, weeks: input.weeks,
  }).where(and(eq(busyBlocks.id, busyId), eq(busyBlocks.userId, userId))).returning({ id: busyBlocks.id });
  if (!block) throw new HttpError(404, "忙碌时段不存在");
}

export async function deleteBusyBlock(userId: string, busyId: string) {
  const [block] = await getDatabase().delete(busyBlocks)
    .where(and(eq(busyBlocks.id, busyId), eq(busyBlocks.userId, userId))).returning({ id: busyBlocks.id });
  if (!block) throw new HttpError(404, "忙碌时段不存在");
}
