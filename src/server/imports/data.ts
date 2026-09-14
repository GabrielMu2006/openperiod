import "server-only";
import { and, eq, gt, inArray } from "drizzle-orm";
import type { ImportCourseDraft, ImportPreviewPayload, ImportSnapshotPayload } from "@/src/domain/import";
import { IMPORT_SNAPSHOT_TTL_MS } from "@/src/domain/import";
import type { Weekday } from "@/src/domain/schedule";
import { getDatabase } from "@/src/server/db";
import { courseExceptions, courseMeetings, courses, importPreviews, importSnapshots } from "@/src/server/db/schema";
import { HttpError } from "@/src/server/http";
import { ensureDefaultSemester } from "@/src/server/semesters/data";

const weekdayNumber: Record<Weekday, number> = {
  monday: 1, tuesday: 2, wednesday: 3, thursday: 4,
  friday: 5, saturday: 6, sunday: 7,
};

export async function createImportPreview(userId: string, payload: ImportPreviewPayload) {
  const semester = await ensureDefaultSemester();
  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const [preview] = await getDatabase()
    .insert(importPreviews)
    .values({ userId, semesterId: semester.id, payload, expiresAt })
    .returning({ id: importPreviews.id });
  if (!preview) throw new Error("Failed to create import preview");
  return { id: preview.id, expiresAt, ...payload };
}

export async function getImportPreview(userId: string, previewId: string) {
  const [preview] = await getDatabase()
    .select({ id: importPreviews.id, payload: importPreviews.payload, expiresAt: importPreviews.expiresAt })
    .from(importPreviews)
    .where(and(eq(importPreviews.id, previewId), eq(importPreviews.userId, userId), gt(importPreviews.expiresAt, new Date())))
    .limit(1);
  if (!preview) throw new HttpError(404, "导入预览不存在或已过期");
  return { id: preview.id, expiresAt: preview.expiresAt, ...preview.payload };
}

export async function confirmImport(userId: string, previewId: string, drafts: ImportCourseDraft[]) {
  const db = getDatabase();

  const snapshotId = await db.transaction(async (tx) => {
    const [preview] = await tx
      .delete(importPreviews)
      .where(and(eq(importPreviews.id, previewId), eq(importPreviews.userId, userId), gt(importPreviews.expiresAt, new Date())))
      .returning({ semesterId: importPreviews.semesterId });
    if (!preview) throw new HttpError(404, "导入预览不存在、已过期或已确认");

    // 替换前先把现有课表（含「本周不去」）存成快照，7 天内可一键恢复
    const savedSnapshotId = await snapshotCurrentCourses(tx, userId, preview.semesterId);

    await tx.delete(courses).where(and(eq(courses.userId, userId), eq(courses.semesterId, preview.semesterId)));
    for (const draft of drafts) {
      const [course] = await tx
        .insert(courses)
        .values({
          userId,
          semesterId: preview.semesterId,
          name: draft.name.trim(),
          instructor: draft.instructor?.trim() || null,
          location: draft.location?.trim() || null,
        })
        .returning({ id: courses.id });
      if (!course) throw new Error("Failed to import course");
      await tx.insert(courseMeetings).values(
        draft.meetings.map((meeting) => ({
          courseId: course.id,
          weekday: weekdayNumber[meeting.weekday],
          startPeriod: meeting.startPeriod,
          endPeriod: meeting.endPeriod,
          weeks: [...new Set(meeting.weeks)].sort((a, b) => a - b),
        })),
      );
    }
    return savedSnapshotId;
  });

  return {
    courseCount: drafts.length,
    meetingCount: drafts.reduce((sum, course) => sum + course.meetings.length, 0),
    snapshotId,
  };
}

type Tx = Parameters<Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]>[0];

async function snapshotCurrentCourses(tx: Tx, userId: string, semesterId: string): Promise<string | null> {
  const courseRows = await tx
    .select({ id: courses.id, name: courses.name, instructor: courses.instructor, location: courses.location })
    .from(courses)
    .where(and(eq(courses.userId, userId), eq(courses.semesterId, semesterId)));
  const meetingRows = courseRows.length
    ? await tx.select().from(courseMeetings).where(inArray(courseMeetings.courseId, courseRows.map((course) => course.id)))
    : [];
  const exceptionRows = meetingRows.length
    ? await tx
        .select({ courseMeetingId: courseExceptions.courseMeetingId, week: courseExceptions.week })
        .from(courseExceptions)
        .where(inArray(courseExceptions.courseMeetingId, meetingRows.map((meeting) => meeting.id)))
    : [];
  const skipByMeeting = new Map<string, number[]>();
  for (const exception of exceptionRows) {
    const weeks = skipByMeeting.get(exception.courseMeetingId) ?? [];
    weeks.push(exception.week);
    skipByMeeting.set(exception.courseMeetingId, weeks);
  }

  const payload: ImportSnapshotPayload = {
    courses: courseRows.map((course) => ({
      name: course.name,
      instructor: course.instructor,
      location: course.location,
      meetings: meetingRows
        .filter((meeting) => meeting.courseId === course.id)
        .map((meeting) => ({
          weekday: meeting.weekday,
          startPeriod: meeting.startPeriod,
          endPeriod: meeting.endPeriod,
          weeks: meeting.weeks,
          skips: (skipByMeeting.get(meeting.id) ?? []).sort((a, b) => a - b),
        })),
    })),
  };

  // 每人每学期只保留最近一份快照
  await tx.delete(importSnapshots).where(and(eq(importSnapshots.userId, userId), eq(importSnapshots.semesterId, semesterId)));
  if (!payload.courses.length) return null;
  const [snapshot] = await tx.insert(importSnapshots).values({ userId, semesterId, payload }).returning({ id: importSnapshots.id });
  return snapshot?.id ?? null;
}

export async function restoreImportSnapshot(userId: string, snapshotId: string) {
  const db = getDatabase();
  const restored = await db.transaction(async (tx) => {
    const [snapshot] = await tx
      .select({ semesterId: importSnapshots.semesterId, payload: importSnapshots.payload, createdAt: importSnapshots.createdAt })
      .from(importSnapshots)
      .where(and(eq(importSnapshots.id, snapshotId), eq(importSnapshots.userId, userId)))
      .limit(1);
    if (!snapshot) throw new HttpError(404, "恢复点不存在或已过期");
    if (Date.now() - snapshot.createdAt.getTime() > IMPORT_SNAPSHOT_TTL_MS) throw new HttpError(410, "恢复点已超过 7 天，无法恢复");

    await tx.delete(courses).where(and(eq(courses.userId, userId), eq(courses.semesterId, snapshot.semesterId)));
    let meetingCount = 0;
    let skipCount = 0;
    for (const course of snapshot.payload.courses) {
      const [inserted] = await tx
        .insert(courses)
        .values({
          userId,
          semesterId: snapshot.semesterId,
          name: course.name,
          instructor: course.instructor,
          location: course.location,
        })
        .returning({ id: courses.id });
      if (!inserted) throw new Error("Failed to restore course");
      if (!course.meetings.length) continue;
      const meetingRows = await tx
        .insert(courseMeetings)
        .values(course.meetings.map((meeting) => ({
          courseId: inserted.id,
          weekday: meeting.weekday,
          startPeriod: meeting.startPeriod,
          endPeriod: meeting.endPeriod,
          weeks: meeting.weeks,
        })))
        .returning({ id: courseMeetings.id });
      meetingCount += meetingRows.length;
      const skipValues = course.meetings.flatMap((meeting, index) =>
        meeting.skips.map((week) => ({ courseMeetingId: meetingRows[index].id, userId, week, type: "SKIP" as const })));
      if (skipValues.length) {
        await tx.insert(courseExceptions).values(skipValues).onConflictDoNothing();
        skipCount += skipValues.length;
      }
    }
    return { semesterId: snapshot.semesterId, courseCount: snapshot.payload.courses.length, meetingCount, skipCount };
  });
  return restored;
}
