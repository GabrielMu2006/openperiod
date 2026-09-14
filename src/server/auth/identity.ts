import "server-only";
import { eq } from "drizzle-orm";
import { users } from "@/src/server/db/schema";
import { getDatabase } from "@/src/server/db";
import { normalizeIdentity, type IdentityInput } from "@/src/domain/identity";
import type { PrivacyLevel } from "@/src/domain/schedule";

export interface ProfilePatch {
  nickname: string;
  defaultPrivacyLevel: PrivacyLevel;
}

export async function identifyUser(input: IdentityInput) {
  const normalized = normalizeIdentity(input);
  const [user] = await getDatabase()
    .insert(users)
    .values(normalized)
    .onConflictDoUpdate({
      target: users.email,
      set: { nickname: normalized.nickname, updatedAt: new Date() },
    })
    .returning({ id: users.id, nickname: users.nickname, email: users.email, emailVerifiedAt: users.emailVerifiedAt });

  if (!user) throw new Error("Failed to identify user");
  return user;
}

export async function updateProfile(userId: string, patch: ProfilePatch) {
  const [user] = await getDatabase()
    .update(users)
    .set({ nickname: patch.nickname, defaultPrivacyLevel: patch.defaultPrivacyLevel, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning({ id: users.id, nickname: users.nickname, email: users.email, defaultPrivacyLevel: users.defaultPrivacyLevel });

  if (!user) throw new Error("Failed to update profile");
  return user;
}
