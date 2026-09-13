import "server-only";
import { users } from "@/src/server/db/schema";
import { getDatabase } from "@/src/server/db";
import { normalizeIdentity, type IdentityInput } from "@/src/domain/identity";

export async function identifyUser(input: IdentityInput) {
  const normalized = normalizeIdentity(input);
  const [user] = await getDatabase()
    .insert(users)
    .values(normalized)
    .onConflictDoUpdate({
      target: users.email,
      set: { nickname: normalized.nickname, updatedAt: new Date() },
    })
    .returning({ id: users.id, nickname: users.nickname, email: users.email });

  if (!user) throw new Error("Failed to identify user");
  return user;
}
