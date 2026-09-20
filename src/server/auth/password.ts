import "server-only";
import { hash, verify, type Options } from "@node-rs/argon2";

// 2 = Argon2id. The package declares Algorithm as an ambient const enum,
// which cannot be imported at runtime with Next's isolatedModules compilation.
const options: Options = { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1, outputLen: 32 };
let dummyHash: Promise<string> | undefined;

export function hashPassword(password: string) {
  return hash(password, options);
}

export async function verifyPassword(encoded: string | null, password: string) {
  // Unknown and passwordless accounts still pay the same verification cost.
  const target = encoded ?? await (dummyHash ??= hashPassword("not-an-account-test-password"));
  try {
    const valid = await verify(target, password);
    return encoded !== null && valid;
  } catch {
    return false;
  }
}
