import "server-only";
import { DEFAULT_SEMESTER, getTeachingWeek } from "@/src/config/semester";
import { getDatabase } from "@/src/server/db";
import { semesters } from "@/src/server/db/schema";

export async function ensureDefaultSemester() {
  const [semester] = await getDatabase()
    .insert(semesters)
    .values({
      school: DEFAULT_SEMESTER.school,
      academicYear: DEFAULT_SEMESTER.academicYear,
      semester: DEFAULT_SEMESTER.semester,
      startDate: DEFAULT_SEMESTER.startDate,
      weekCount: DEFAULT_SEMESTER.weekCount,
      timezone: DEFAULT_SEMESTER.timezone,
    })
    .onConflictDoUpdate({
      target: [semesters.school, semesters.academicYear, semesters.semester],
      set: {
        startDate: DEFAULT_SEMESTER.startDate,
        weekCount: DEFAULT_SEMESTER.weekCount,
        timezone: DEFAULT_SEMESTER.timezone,
      },
    })
    .returning();

  if (!semester) throw new Error("Failed to initialize semester");
  return {
    ...semester,
    currentWeek: getTeachingWeek({ ...semester, id: semester.id }),
  };
}
