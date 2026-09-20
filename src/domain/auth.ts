import { z } from "zod";

export const PASSWORD_MIN_LENGTH = 6;
export const PASSWORD_MAX_LENGTH = 128;
export const challengePurposes = ["REGISTER", "SET_PASSWORD", "RESET_PASSWORD"] as const;
export type ChallengePurpose = typeof challengePurposes[number];
const email = z.string().trim().toLowerCase().pipe(z.email("请输入有效邮箱").max(320));
export const newPasswordSchema = z.string().min(PASSWORD_MIN_LENGTH, "密码至少需要 6 个字符").max(PASSWORD_MAX_LENGTH, "密码不能超过 128 个字符");
const password = z.string().min(1, "请输入密码").max(PASSWORD_MAX_LENGTH);
export const loginSchema = z.object({ email, password });
export const challengeSchema = z.object({ email, purpose: z.enum(challengePurposes) });
export const completeChallengeSchema = challengeSchema.extend({
  challengeId: z.uuid(),
  code: z.string().trim().regex(/^\d{6}$/, "请输入 6 位数字验证码"),
  password: newPasswordSchema,
});
export const changePasswordSchema = z.object({ currentPassword: password, password: newPasswordSchema });
