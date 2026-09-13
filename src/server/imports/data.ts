import "server-only";
import { and, eq, gt } from "drizzle-orm";
import type { ImportCourseDraft, ImportPreviewPayload } from "@/src/domain/import";
import type { Weekday } from "@/src/domain/schedule";
import { getDatabase } from "@/src/server/db";
import { courseMeetings, courses, importPreviews } from "@/src/server/db/schema";
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

  await db.transaction(async (tx) => {
    const [preview] = await tx
      .delete(importPreviews)
      .where(and(eq(importPreviews.id, previewId), eq(importPreviews.userId, userId), gt(importPreviews.expiresAt, new Date())))
      .returning({ semesterId: importPreviews.semesterId });
    if (!preview) throw new HttpError(404, "导入预览不存在、已过期或已确认");

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
  });

  return {
    courseCount: drafts.length,
    meetingCount: drafts.reduce((sum, course) => sum + course.meetings.length, 0),
  };
}
