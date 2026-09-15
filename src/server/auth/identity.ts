import "server-only";
import { eq } from "drizzle-orm";
import { users } from "@/src/server/db/schema";
import { getDatabase } from "@/src/server/db";
import { isPlaceholderNickname, normalizeIdentity, placeholderNicknameFor } from "@/src/domain/identity";
import type { PrivacyLevel } from "@/src/domain/schedule";
import { HttpError } from "@/src/server/http";

export interface ProfilePatch {
  nickname?: string;
  defaultPrivacyLevel?: PrivacyLevel;
  scheduleId?: string | null;
}

// 仅凭邮箱识别身份：不存在则创建（昵称先用邮箱前缀占位），存在则原样返回。
// 登录绝不改动已有资料——昵称只能由本人通过 updateProfile 修改。
export async function identifyUser(email: string) {
  const normalized = normalizeIdentity({ email });
  const database = getDatabase();
  const columns = { id: users.id, nickname: users.nickname, email: users.email, scheduleId: users.scheduleId, emailVerifiedAt: users.emailVerifiedAt };

  const [created] = await database
    .insert(users)
    .values({ email: normalized.email, nickname: placeholderNicknameFor(normalized.email) })
    .onConflictDoNothing({ target: users.email })
    .returning(columns);
  if (created) return created;

  const [existing] = await database.select(columns).from(users).where(eq(users.email, normalized.email)).limit(1);
  if (!existing) throw new Error("Failed to identify user");
  return existing;
}

export async function updateProfile(userId: string, patch: ProfilePatch) {
  if (patch.nickname === undefined && patch.defaultPrivacyLevel === undefined && patch.scheduleId === undefined) {
    throw new HttpError(400, "没有需要保存的修改");
  }

  const [user] = await getDatabase()
    .update(users)
    .set({
      ...(patch.nickname !== undefined ? { nickname: patch.nickname } : {}),
      ...(patch.defaultPrivacyLevel !== undefined ? { defaultPrivacyLevel: patch.defaultPrivacyLevel } : {}),
      ...(patch.scheduleId !== undefined ? { scheduleId: patch.scheduleId } : {}),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning({ id: users.id, nickname: users.nickname, email: users.email, defaultPrivacyLevel: users.defaultPrivacyLevel, scheduleId: users.scheduleId });

  if (!user) throw new Error("Failed to update profile");
  return user;
}

export { isPlaceholderNickname };
