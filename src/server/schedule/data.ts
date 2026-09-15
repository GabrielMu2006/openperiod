import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import type { z } from "zod";
import type { Weekday } from "@/src/domain/schedule";
import { getDatabase } from "@/src/server/db";
import { busyBlocks, courseExceptions, courseMeetings, courses } from "@/src/server/db/schema";
import { HttpError } from "@/src/server/http";
import { ensureDefaultSemester } from "@/src/server/semesters/data";
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

export async function getMySchedule(userId: string, requestedWeek?: number) {
  const db = getDatabase();
  const semester = await ensureDefaultSemester();
  const week = requestedWeek ?? semester.currentWeek;
  const courseRows = await db.select().from(courses)
    .where(and(eq(courses.userId, userId), eq(courses.semesterId, semester.id)));
  const meetingRows = courseRows.length
    ? await db.select().from(courseMeetings).where(inArray(courseMeetings.courseId, courseRows.map((course) => course.id)))
    : [];
  const [exceptionRows, busyRows] = await Promise.all([
    meetingRows.length
      ? db.select({ courseMeetingId: courseExceptions.courseMeetingId }).from(courseExceptions)
          .where(and(eq(courseExceptions.userId, userId), eq(courseExceptions.week, week), inArray(courseExceptions.courseMeetingId, meetingRows.map((meeting) => meeting.id))))
      : Promise.resolve([]),
    db.select().from(busyBlocks)
      .where(and(eq(busyBlocks.userId, userId), eq(busyBlocks.semesterId, semester.id))),
  ]);
  const skipped = new Set(exceptionRows.map((exception) => exception.courseMeetingId));

  return {
    semester: {
      id: semester.id,
      academicYear: semester.academicYear,
      semester: semester.semester,
      currentWeek: semester.currentWeek,
      weekCount: semester.weekCount,
      startDate: semester.startDate,
      scheduleId: semester.scheduleId,
    },
    week,
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
  const semester = await ensureDefaultSemester();
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

export async function createBusyBlock(userId: string, input: BusyInput) {
  const semester = await ensureDefaultSemester();
  const [block] = await getDatabase().insert(busyBlocks).values({
    userId, semesterId: semester.id, kind: input.kind, title: input.title || null,
    weekday: weekdayNumber[input.weekday], startPeriod: input.startPeriod,
    endPeriod: input.endPeriod, weeks: input.weeks,
  }).returning({ id: busyBlocks.id });
  if (!block) throw new Error("Failed to create busy block");
  return block;
}

export async function updateBusyBlock(userId: string, busyId: string, input: BusyInput) {
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
