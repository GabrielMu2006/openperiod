import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { generateInviteCode, normalizeInviteCode } from "@/src/domain/groups";
import type { PrivacyLevel } from "@/src/domain/schedule";
import { getTeachingWeek } from "@/src/config/semester";
import { scheduleFromSemester } from "@/src/config/school-schedules";
import { getDatabase } from "@/src/server/db";
import {
  courses,
  groupMembers,
  groupPrivacyOverrides,
  groups,
  semesters,
  users,
} from "@/src/server/db/schema";
import { HttpError } from "@/src/server/http";
import { ensureDefaultSemester } from "@/src/server/semesters/data";

function isUniqueViolation(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "23505");
}

export async function listGroupsForUser(userId: string) {
  const db = getDatabase();
  const memberships = await db
    .select({
      id: groups.id,
      name: groups.name,
      inviteCode: groups.inviteCode,
      role: groupMembers.role,
      semesterId: semesters.id,
      school: semesters.school,
      academicYear: semesters.academicYear,
      semester: semesters.semester,
      startDate: semesters.startDate,
      weekCount: semesters.weekCount,
      timezone: semesters.timezone,
      scheduleId: semesters.scheduleId,
      customSchedule: semesters.customSchedule,
      privacyLevel: groupPrivacyOverrides.privacyLevel,
    })
    .from(groupMembers)
    .innerJoin(groups, eq(groupMembers.groupId, groups.id))
    .innerJoin(semesters, eq(groups.semesterId, semesters.id))
    .leftJoin(
      groupPrivacyOverrides,
      and(
        eq(groupPrivacyOverrides.groupId, groups.id),
        eq(groupPrivacyOverrides.userId, userId),
      ),
    )
    .where(eq(groupMembers.userId, userId));

  return Promise.all(
    memberships.map(async (group) => {
      const members = await db
        .select({ id: users.id, nickname: users.nickname, scheduleId: users.scheduleId })
        .from(groupMembers)
        .innerJoin(users, eq(groupMembers.userId, users.id))
        .where(eq(groupMembers.groupId, group.id));

      // 每位成员在该群学期里的课程数，用于在前端标注「未录课表」
      const memberIds = members.map((member) => member.id);
      const courseCounts = memberIds.length
        ? await db
            .select({ userId: courses.userId, count: sql<number>`count(*)::int` })
            .from(courses)
            .where(and(eq(courses.semesterId, group.semesterId), inArray(courses.userId, memberIds)))
            .groupBy(courses.userId)
        : [];
      const countByUser = new Map(courseCounts.map((row) => [row.userId, row.count]));

      return {
        id: group.id,
        name: group.name,
        inviteCode: group.inviteCode,
        role: group.role,
        privacyLevel: group.privacyLevel as PrivacyLevel | null,
        semester: {
          id: group.semesterId,
          school: group.school,
          academicYear: group.academicYear,
          semester: group.semester,
          startDate: group.startDate,
          weekCount: group.weekCount,
          timezone: group.timezone,
          scheduleId: group.scheduleId,
          schedule: scheduleFromSemester({ scheduleId: group.scheduleId, customSchedule: group.customSchedule }),
          currentWeek: getTeachingWeek({
            id: group.semesterId,
            school: group.school,
            academicYear: group.academicYear,
            semester: group.semester,
            startDate: group.startDate,
            weekCount: group.weekCount,
            timezone: group.timezone,
          }),
        },
        members: members.map((member) => ({ ...member, courseCount: countByUser.get(member.id) ?? 0 })),
      };
    }),
  );
}

export async function createGroup(userId: string, name: string, privacyLevel: PrivacyLevel | null) {
  // 群组挂到群主学校的学期上，节次网格随群主学校的作息预设
  const [owner] = await getDatabase()
    .select({ scheduleId: users.scheduleId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const semester = await ensureDefaultSemester(owner?.scheduleId);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await getDatabase().transaction(async (tx) => {
        const [group] = await tx
          .insert(groups)
          .values({ name, inviteCode: generateInviteCode(), ownerId: userId, semesterId: semester.id })
          .returning({ id: groups.id, name: groups.name, inviteCode: groups.inviteCode });
        if (!group) throw new Error("Failed to create group");

        await tx.insert(groupMembers).values({ groupId: group.id, userId, role: "OWNER" });
        if (privacyLevel !== null) {
          await tx.insert(groupPrivacyOverrides).values({ groupId: group.id, userId, privacyLevel });
        }
        return group;
      });
    } catch (error) {
      if (!isUniqueViolation(error) || attempt === 4) throw error;
    }
  }
  throw new Error("Failed to generate a unique invite code");
}

export async function joinGroup(userId: string, rawCode: string, privacyLevel: PrivacyLevel | null) {
  const inviteCode = normalizeInviteCode(rawCode);
  const [group] = await getDatabase()
    .select({ id: groups.id, name: groups.name })
    .from(groups)
    .where(eq(groups.inviteCode, inviteCode))
    .limit(1);
  if (!group) throw new HttpError(404, "邀请码不存在或已失效");

  await getDatabase().transaction(async (tx) => {
    await tx.insert(groupMembers).values({ groupId: group.id, userId, role: "MEMBER" }).onConflictDoNothing();
    if (privacyLevel === null) {
      await tx
        .delete(groupPrivacyOverrides)
        .where(and(eq(groupPrivacyOverrides.groupId, group.id), eq(groupPrivacyOverrides.userId, userId)));
    } else {
      await tx
        .insert(groupPrivacyOverrides)
        .values({ groupId: group.id, userId, privacyLevel })
        .onConflictDoUpdate({
          target: [groupPrivacyOverrides.groupId, groupPrivacyOverrides.userId],
          set: { privacyLevel },
        });
    }
  });
  return group;
}

export async function updateGroupPrivacy(
  userId: string,
  groupId: string,
  privacyLevel: PrivacyLevel | null,
) {
  const db = getDatabase();
  const [membership] = await db
    .select({ groupId: groupMembers.groupId })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
    .limit(1);
  if (!membership) throw new HttpError(404, "群组不存在或你不是群组成员");

  if (privacyLevel === null) {
    await db
      .delete(groupPrivacyOverrides)
      .where(and(eq(groupPrivacyOverrides.groupId, groupId), eq(groupPrivacyOverrides.userId, userId)));
  } else {
    await db
      .insert(groupPrivacyOverrides)
      .values({ groupId, userId, privacyLevel })
      .onConflictDoUpdate({
        target: [groupPrivacyOverrides.groupId, groupPrivacyOverrides.userId],
        set: { privacyLevel },
      });
  }
}

export async function regenerateInviteCode(userId: string, groupId: string) {
  const db = getDatabase();
  const [owned] = await db
    .select({ id: groups.id })
    .from(groups)
    .where(and(eq(groups.id, groupId), eq(groups.ownerId, userId)))
    .limit(1);
  if (!owned) throw new HttpError(403, "只有群主可以更新邀请码");

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const inviteCode = generateInviteCode();
      await db.update(groups).set({ inviteCode }).where(eq(groups.id, groupId));
      return inviteCode;
    } catch (error) {
      if (!isUniqueViolation(error) || attempt === 4) throw error;
    }
  }
  throw new Error("Failed to generate a unique invite code");
}
