export interface IdentityInput {
  email: string;
}

export function normalizeIdentity(input: IdentityInput): IdentityInput {
  return {
    email: input.email.trim().toLowerCase(),
  };
}

// 新账号先以邮箱前缀作为占位昵称，验证成功后再引导用户设置正式昵称
export function placeholderNicknameFor(email: string) {
  return (email.split("@")[0] || "同学").slice(0, 80);
}

export function isPlaceholderNickname(nickname: string, email: string) {
  return nickname === placeholderNicknameFor(email);
}
