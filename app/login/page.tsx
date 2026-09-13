import { IdentityForm } from "@/components/identity-form";

export default function LoginPage() {
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
          <p>留下昵称和邮箱，即可在这台设备上恢复你的课表与群组。</p>
        </div>
        <IdentityForm />
        <p className="identity-disclaimer">V1 不验证邮箱，仅适合小规模熟人使用。请勿使用他人的邮箱。</p>
      </section>
    </main>
  );
}
