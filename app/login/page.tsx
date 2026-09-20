import { IdentityForm } from "@/components/identity-form";
import { FeedbackButton } from "@/components/feedback-button";
import { isEmailVerificationEnabled } from "@/src/server/auth/verification";
import { challengePurposes } from "@/src/domain/auth";
import { ArrowRight } from "@phosphor-icons/react/ssr";

// 邮件服务可用性取决于运行环境的 DirectMail 配置，不能在构建期固化。
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const verificationEnabled = isEmailVerificationEnabled();
  const { mode } = await searchParams;
  const initialMode = challengePurposes.find((purpose) => purpose === mode) ?? "login";
  return (
    <main className="identity-page">
        <FeedbackButton />
      <section className="identity-card">
        <div className="identity-brand" aria-hidden="true">
          <span className="logo-mark"><i /><i /></span>
          <div><strong>课隙</strong><small>OpenPeriod</small></div>
        </div>
        <div className="identity-heading">
          <p className="eyebrow">WELCOME</p>
          <h1>找到大家共同的空档</h1>
          <p>用邮箱和密码登录，课表与群组数据随账号保留。</p>
        </div>
        <IdentityForm initialMode={initialMode} />
        <p className="identity-disclaimer">
          {verificationEnabled
            ? "日常登录无需验证码；注册、首次设置密码和找回密码时验证邮箱。"
            : "邮件服务暂不可用，已设置密码的账号仍可登录。"}
        </p>
        <p className="welcome-link"><a href="/welcome">第一次用课隙？先了解它是什么<ArrowRight className="ui-icon" weight="bold" /></a></p>
      </section>
    </main>
  );
}
