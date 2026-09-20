import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { generateInviteCode, normalizeInviteCode } from "@/src/domain/groups";
import type { MemberScheduleState, PrivacyLevel } from "@/src/domain/schedule";
import { getTeachingWeek } from "@/src/config/semester";
import { scheduleFromSemester } from "@/src/config/school-schedules";
import { getDatabase } from "@/src/server/db";
import {
  customSchedules,
  groupMembers,
  groupPrivacyOverrides,
  groups,
  semesters,
  users,
} from "@/src/server/db/schema";
import { HttpError } from "@/src/server/http";
import { ensureDefaultSemester, getUserCustomRows, summarizeMemberSchedules } from "@/src/server/semesters/data";

function isUniqueViolation(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "23505");
}

export async function listGroupsForUser(userId: string, options: { includeArchived?: boolean } = {}) {
  const db = getDatabase();
  const memberships = await db
    .select({
      id: groups.id,
      name: groups.name,
      inviteCode: groups.inviteCode,
      ownerId: groups.ownerId,
      archivedAt: groups.archivedAt,
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
    .where(and(
      eq(groupMembers.userId, userId),
      options.includeArchived ? undefined : isNull(groups.archivedAt),
    ));

  return Promise.all(
    memberships.map(async (group) => {
      const members = await db
        .select({
          id: users.id,
          nickname: users.nickname,
          scheduleId: users.scheduleId,
        })
        .from(groupMembers)
        .innerJoin(users, eq(groupMembers.userId, users.id))
        .where(eq(groupMembers.groupId, group.id));

      // 课程数与完整度按成员自己学校的学期统计（与共同空闲共用同一学期定位规则，AV-04），
      // 跨校成员的课在自己学校的学期行里也能被数到。
      const summaries = await summarizeMemberSchedules(
        members.map((member) => ({ id: member.id, scheduleId: member.scheduleId })),
        group.academicYear,
        group.semester,
      );
      // 自定义群组的网格跟随群主自己的作息（SCH-01）；历史共享列仅作兜底
      const customRows = group.scheduleId === "custom"
        ? await getUserCustomRows(group.ownerId, group.academicYear, group.semester) ?? group.customSchedule
        : null;

      return {
        id: group.id,
        name: group.name,
        inviteCode: group.inviteCode,
        role: group.ownerId === userId ? "OWNER" as const : "MEMBER" as const,
        archivedAt: group.archivedAt,
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
          schedule: scheduleFromSemester({ scheduleId: group.scheduleId, customSchedule: customRows }),
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
        members: members.map((member) => {
          const summary = summaries.get(member.id);
          return {
            ...member,
            role: member.id === group.ownerId ? "OWNER" as const : "MEMBER" as const,
            courseCount: summary?.courseCount ?? 0,
            scheduleState: summary?.state ?? ("unrecorded" as MemberScheduleState),
          };
        }),
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
  return getDatabase().transaction(async (tx) => {
    const [group] = await tx
      .select({ id: groups.id, name: groups.name })
      .from(groups)
      .where(and(eq(groups.inviteCode, inviteCode), isNull(groups.archivedAt)))
      .limit(1)
      .for("update");
    if (!group) throw new HttpError(404, "邀请码不存在或已失效");

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
    return group;
  });
}

export async function updateGroupPrivacy(
  userId: string,
  groupId: string,
  privacyLevel: PrivacyLevel | null,
) {
  await getDatabase().transaction(async (tx) => {
    const [membership] = await tx
      .select({ groupId: groupMembers.groupId, archivedAt: groups.archivedAt })
      .from(groupMembers)
      .innerJoin(groups, eq(groupMembers.groupId, groups.id))
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
      .limit(1)
      .for("update");
    if (!membership) throw new HttpError(404, "群组不存在或你不是群组成员");
    if (membership.archivedAt) throw new HttpError(409, "群组已归档，请先恢复后再修改隐私设置");

    if (privacyLevel === null) {
      await tx
        .delete(groupPrivacyOverrides)
        .where(and(eq(groupPrivacyOverrides.groupId, groupId), eq(groupPrivacyOverrides.userId, userId)));
    } else {
      await tx
        .insert(groupPrivacyOverrides)
        .values({ groupId, userId, privacyLevel })
        .onConflictDoUpdate({
          target: [groupPrivacyOverrides.groupId, groupPrivacyOverrides.userId],
          set: { privacyLevel },
        });
    }
  });
}

export async function regenerateInviteCode(userId: string, groupId: string) {
  const db = getDatabase();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const inviteCode = generateInviteCode();
      const [updated] = await db
        .update(groups)
        .set({ inviteCode })
        .where(and(eq(groups.id, groupId), eq(groups.ownerId, userId), isNull(groups.archivedAt)))
        .returning({ inviteCode: groups.inviteCode });
      if (updated) return updated.inviteCode;
      break;
    } catch (error) {
      if (!isUniqueViolation(error) || attempt === 4) throw error;
    }
  }
  const [group] = await db
    .select({ ownerId: groups.ownerId, archivedAt: groups.archivedAt })
    .from(groups)
    .where(eq(groups.id, groupId))
    .limit(1);
  if (!group) throw new HttpError(404, "群组不存在");
  if (group.ownerId !== userId) throw new HttpError(403, "只有群主可以更新邀请码");
  if (group.archivedAt) throw new HttpError(409, "群组已归档，请先恢复后再更新邀请码");
  throw new Error("Failed to generate a unique invite code");
}

export async function renameGroup(userId: string, groupId: string, name: string) {
  const db = getDatabase();
  const [updated] = await db
    .update(groups)
    .set({ name })
    .where(and(eq(groups.id, groupId), eq(groups.ownerId, userId), isNull(groups.archivedAt)))
    .returning({ id: groups.id, name: groups.name });
  if (updated) return updated;

  const [group] = await db
    .select({ ownerId: groups.ownerId, archivedAt: groups.archivedAt })
    .from(groups)
    .where(eq(groups.id, groupId))
    .limit(1);
  if (!group) throw new HttpError(404, "群组不存在");
  if (group.ownerId !== userId) throw new HttpError(403, "只有群主可以修改群组名称");
  throw new HttpError(409, "群组已归档，请先恢复后再修改名称");
}

export async function setGroupArchived(userId: string, groupId: string, archived: boolean) {
  return getDatabase().transaction(async (tx) => {
    const [group] = await tx
      .select({ ownerId: groups.ownerId, archivedAt: groups.archivedAt })
      .from(groups)
      .where(eq(groups.id, groupId))
      .limit(1)
      .for("update");
    if (!group) throw new HttpError(404, "群组不存在");
    if (group.ownerId !== userId) throw new HttpError(403, "只有群主可以归档或恢复群组");

    const archivedAt = archived ? group.archivedAt ?? new Date() : null;
    const [updated] = await tx
      .update(groups)
      .set({ archivedAt })
      .where(eq(groups.id, groupId))
      .returning({ id: groups.id, archivedAt: groups.archivedAt });
    return updated;
  });
}

export async function leaveGroup(userId: string, groupId: string) {
  await getDatabase().transaction(async (tx) => {
    const [group] = await tx
      .select({ ownerId: groups.ownerId })
      .from(groups)
      .innerJoin(groupMembers, and(
        eq(groupMembers.groupId, groups.id),
        eq(groupMembers.userId, userId),
      ))
      .where(eq(groups.id, groupId))
      .limit(1)
      .for("update");
    if (!group) throw new HttpError(404, "群组不存在或你不是群组成员");
    if (group.ownerId === userId) {
      throw new HttpError(409, "群主不能直接退出；请先转让群主，只有自己时可归档群组");
    }

    await tx.delete(groupPrivacyOverrides).where(and(
      eq(groupPrivacyOverrides.groupId, groupId),
      eq(groupPrivacyOverrides.userId, userId),
    ));
    await tx.delete(groupMembers).where(and(
      eq(groupMembers.groupId, groupId),
      eq(groupMembers.userId, userId),
    ));
  });
}

export async function removeGroupMember(ownerId: string, groupId: string, memberId: string) {
  await getDatabase().transaction(async (tx) => {
    const [group] = await tx
      .select({ ownerId: groups.ownerId, archivedAt: groups.archivedAt })
      .from(groups)
      .where(eq(groups.id, groupId))
      .limit(1)
      .for("update");
    if (!group) throw new HttpError(404, "群组不存在");
    if (group.ownerId !== ownerId) throw new HttpError(403, "只有群主可以移出成员");
    if (group.archivedAt) throw new HttpError(409, "群组已归档，请先恢复后再管理成员");
    if (ownerId === memberId) {
      throw new HttpError(400, "群主不能移出自己；请先转让群主，只有自己时可归档群组");
    }

    const [membership] = await tx
      .select({ userId: groupMembers.userId })
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, memberId)))
      .limit(1);
    if (!membership) throw new HttpError(404, "该用户不是群组成员");

    await tx.delete(groupPrivacyOverrides).where(and(
      eq(groupPrivacyOverrides.groupId, groupId),
      eq(groupPrivacyOverrides.userId, memberId),
    ));
    await tx.delete(groupMembers).where(and(
      eq(groupMembers.groupId, groupId),
      eq(groupMembers.userId, memberId),
    ));
  });
}

export async function transferGroupOwnership(ownerId: string, groupId: string, memberId: string) {
  await getDatabase().transaction(async (tx) => {
    const [group] = await tx
      .select({
        ownerId: groups.ownerId,
        archivedAt: groups.archivedAt,
        scheduleId: semesters.scheduleId,
        academicYear: semesters.academicYear,
        semester: semesters.semester,
        legacyCustomSchedule: semesters.customSchedule,
      })
      .from(groups)
      .innerJoin(semesters, eq(groups.semesterId, semesters.id))
      .where(eq(groups.id, groupId))
      .limit(1)
      .for("update");
    if (!group) throw new HttpError(404, "群组不存在");
    if (group.ownerId !== ownerId) throw new HttpError(403, "只有群主可以转让群主身份");
    if (group.archivedAt) throw new HttpError(409, "群组已归档，请先恢复后再转让群主");
    if (ownerId === memberId) throw new HttpError(400, "该成员已经是群主");

    const [targetMembership] = await tx
      .select({ userId: groupMembers.userId })
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, memberId)))
      .limit(1);
    if (!targetMembership) throw new HttpError(404, "接收人不是群组成员");

    if (group.scheduleId === "custom") {
      const schedules = await tx
        .select({ userId: customSchedules.userId, rows: customSchedules.scheduleRows })
        .from(customSchedules)
        .where(and(
          eq(customSchedules.academicYear, group.academicYear),
          eq(customSchedules.semester, group.semester),
          inArray(customSchedules.userId, [ownerId, memberId]),
        ));
      const rowsByUser = new Map(schedules.map((item) => [item.userId, item.rows]));
      const currentRows = rowsByUser.get(ownerId) ?? group.legacyCustomSchedule;
      const targetRows = rowsByUser.get(memberId) ?? group.legacyCustomSchedule;
      if (!currentRows || !targetRows || JSON.stringify(currentRows) !== JSON.stringify(targetRows)) {
        throw new HttpError(409, "自定义作息群只能转让给作息完全相同的成员，以免改变群组时间轴");
      }
    }

    await tx.update(groupMembers).set({ role: "MEMBER" }).where(eq(groupMembers.groupId, groupId));
    await tx.update(groupMembers).set({ role: "OWNER" }).where(and(
      eq(groupMembers.groupId, groupId),
      eq(groupMembers.userId, memberId),
    ));
    await tx.update(groups).set({ ownerId: memberId }).where(eq(groups.id, groupId));
  });
}
