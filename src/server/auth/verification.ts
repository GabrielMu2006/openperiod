import "server-only";
import { directMailConfigured } from "@/src/server/mail/directmail";
import { HttpError } from "@/src/server/http";

export function isEmailVerificationEnabled() {
  return directMailConfigured();
}

export function assertEmailVerificationConfigured() {
  if (!isEmailVerificationEnabled()) throw new HttpError(503, "邮箱验证服务暂不可用，请稍后重试；已设置密码的账号仍可使用密码登录");
}
