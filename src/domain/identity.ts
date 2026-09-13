export interface IdentityInput {
  nickname: string;
  email: string;
}

export function normalizeIdentity(input: IdentityInput): IdentityInput {
  return {
    nickname: input.nickname.trim(),
    email: input.email.trim().toLowerCase(),
  };
}
