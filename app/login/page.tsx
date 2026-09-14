import { IdentityForm } from "@/components/identity-form";
import { isEmailVerificationEnabled } from "@/src/server/auth/verification";

// 验证开关取决于运行环境的 DirectMail 配置，不能在构建期固化
export const dynamic = "force-dynamic";

export default function LoginPage() {
  const verificationEnabled = isEmailVerificationEnabled();
  return (
    <main className="identity-page">
      <section className="identity-card">
        <div className="identity-brand" aria-hidden="true">
          <span className="logo-mark"><i /><i /></span>
          <div><strong>课隙</strong><small>OpenPeriod</small></div>
        </div>
        <div className="identity-heading">
          <p className="eyebrow">WELCOME</p>
          <h1>找到大家共同的空档</h1>
          <p>输入邮箱即可登录或注册，课表与群组数据随账号保留。</p>
        </div>
        <IdentityForm />
        <p className="identity-disclaimer">
          {verificationEnabled
            ? "新邮箱首次登录需要输入邮件验证码，确认邮箱属于你本人。"
            : "V1 暂不验证邮箱，仅适合小规模熟人使用。请勿使用他人的邮箱。"}
        </p>
        <p className="welcome-link"><a href="/welcome">第一次用课隙？先了解它是什么 →</a></p>
      </section>
    </main>
  );
}
