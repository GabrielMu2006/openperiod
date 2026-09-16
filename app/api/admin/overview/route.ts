import { desc, eq, sql } from "drizzle-orm";
import { getDatabase } from "@/src/server/db";
import { courses, groupMembers, groups, users } from "@/src/server/db/schema";
import { isPlaceholderNickname } from "@/src/domain/identity";
import { rejectUnlessAdmin } from "@/src/server/admin";
import { errorResponse } from "@/src/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 只读站点总览：仅服务项目所有者，凭 ADMIN_KEY 访问，不提供任何写操作。
const ITEM_LIMIT = 500;

export async function GET(request: Request) {
  const denied = await rejectUnlessAdmin(request);
  if (denied) return denied;

  try {
    const db = getDatabase();
    const [userRows, courseCounts, membershipCounts, groupRows, groupMemberCounts] = await Promise.all([
      db
        .select({
          id: users.id,
          email: users.email,
          nickname: users.nickname,
          privacy: users.defaultPrivacyLevel,
          emailVerifiedAt: users.emailVerifiedAt,
          createdAt: users.createdAt,
        })
        .from(users)
        .orderBy(desc(users.createdAt))
        .limit(ITEM_LIMIT),
      db.select({ userId: courses.userId, total: sql<number>`count(*)::int` }).from(courses).groupBy(courses.userId),
      db
        .select({ userId: groupMembers.userId, total: sql<number>`count(*)::int` })
        .from(groupMembers)
        .groupBy(groupMembers.userId),
      db
        .select({
          id: groups.id,
          name: groups.name,
          inviteCode: groups.inviteCode,
          createdAt: groups.createdAt,
          ownerNickname: users.nickname,
          ownerEmail: users.email,
        })
        .from(groups)
        .leftJoin(users, eq(users.id, groups.ownerId))
        .orderBy(desc(groups.createdAt))
        .limit(ITEM_LIMIT),
      db
        .select({ groupId: groupMembers.groupId, total: sql<number>`count(*)::int` })
        .from(groupMembers)
        .groupBy(groupMembers.groupId),
    ]);

    const courseByUser = new Map(courseCounts.map((row) => [row.userId, row.total]));
    const membershipByUser = new Map(membershipCounts.map((row) => [row.userId, row.total]));
    const membersByGroup = new Map(groupMemberCounts.map((row) => [row.groupId, row.total]));

    return Response.json({
      generatedAt: new Date().toISOString(),
      accounts: {
        total: userRows.length,
        truncated: userRows.length >= ITEM_LIMIT,
        items: userRows.map((row) => ({
          id: row.id,
          email: row.email,
          nickname: row.nickname,
          placeholder: isPlaceholderNickname(row.nickname, row.email),
          verified: row.emailVerifiedAt !== null,
          privacy: row.privacy,
          courseCount: courseByUser.get(row.id) ?? 0,
          groupCount: membershipByUser.get(row.id) ?? 0,
          createdAt: row.createdAt.toISOString(),
        })),
      },
      groups: {
        total: groupRows.length,
        truncated: groupRows.length >= ITEM_LIMIT,
        items: groupRows.map((row) => ({
          id: row.id,
          name: row.name,
          inviteCode: row.inviteCode,
          ownerNickname: row.ownerNickname,
          ownerEmail: row.ownerEmail,
          memberCount: membersByGroup.get(row.id) ?? 0,
          createdAt: row.createdAt.toISOString(),
        })),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
