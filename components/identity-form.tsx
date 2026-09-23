"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { listSchedulePresets } from "@/src/config/school-schedules";
import { ThemedSelect } from "@/components/themed-select";
import { schoolPickerEmptyFooter } from "@/components/import-upload";
import { PasswordField } from "@/components/password-field";
import type { ChallengePurpose } from "@/src/domain/auth";

type Mode = "login" | ChallengePurpose;
type Step = "email" | "code" | "nickname";
const labels: Record<ChallengePurpose, string> = { REGISTER: "注册账号", SET_PASSWORD: "老账号首次设置密码", RESET_PASSWORD: "找回密码" };
const notes: Record<ChallengePurpose, string> = {
  REGISTER: "验证邮箱后设置密码，即可创建账号。",
  SET_PASSWORD: "使用原账号的邮箱验证身份，课表和群组会完整保留。已设置过密码请返回登录或找回密码。",
  RESET_PASSWORD: "验证邮箱后设置新密码，所有旧登录会话会失效。尚未设置过密码的老账号请选择首次设置密码。",
};

export function IdentityForm({ initialMode = "login" }: { initialMode?: Mode }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [step, setStep] = useState<Step>("email");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [nickname, setNickname] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (step !== "code") return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [step]);

  function enter() { router.replace("/"); router.refresh(); }
  function switchMode(next: Mode) { setMode(next); setStep("email"); setError(""); setCode(""); setChallengeId(""); }
  function finish(body: { user?: { nickname: string }; needsNickname?: boolean }) {
    if (!body.user) throw new Error("无法确认登录状态，请重试");
    if (body.needsNickname) { setNickname(body.user.nickname); setStep("nickname"); }
    else enter();
  }

  async function requestCode(resend = false) {
    const response = await fetch(resend ? "/api/auth/resend" : "/api/auth/identify", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, purpose: mode }),
    });
    const body = await response.json() as { error?: string; challengeId?: string; email?: string };
    if (!response.ok || !body.challengeId || !body.email) throw new Error(body.error ?? "无法发送验证码");
    setEmail(body.email);
    setChallengeId(body.challengeId);
    setCode("");
    setNow(Date.now());
    setCooldownUntil(Date.now() + 60_000);
    setStep("code");
  }

  async function submitEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true); setError("");
    try {
      if (mode !== "login") { await requestCode(); return; }
      const response = await fetch("/api/auth/login", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: form.get("password") }),
      });
      const body = await response.json() as { error?: string; user?: { nickname: string }; needsNickname?: boolean };
      if (!response.ok) throw new Error(body.error ?? "暂时无法登录");
      finish(body);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "暂时无法登录"); }
    finally { setPending(false); }
  }

  async function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError("");
    if (form.get("password") !== form.get("confirmPassword")) { setError("两次输入的密码不一致"); return; }
    setPending(true);
    try {
      const response = await fetch("/api/auth/verify", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, purpose: mode, challengeId, code, password: form.get("password") }),
      });
      const body = await response.json() as { error?: string; user?: { nickname: string }; needsNickname?: boolean };
      if (!response.ok) throw new Error(body.error ?? "验证失败");
      finish(body);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "验证失败"); }
    finally { setPending(false); }
  }

  async function resendCode() {
    if (pending || Date.now() < cooldownUntil) return;
    setPending(true); setError("");
    try { await requestCode(true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "重新发送失败"); }
    finally { setPending(false); }
  }

  async function submitNickname(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/auth/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nickname, ...(schoolId === "custom" || listSchedulePresets().some((preset) => preset.id === schoolId) ? { scheduleId: schoolId } : {}) }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "保存昵称失败");
      enter();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存昵称失败");
      setPending(false);
    }
  }

  if (step === "code" && mode !== "login") {
    const cooldownSeconds = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));
    return <form className="identity-form" onSubmit={submitCode} key="code">
      <h2 className="auth-mode-title">{labels[mode]}</h2>
      <p className="auth-mode-note auth-email">如果邮箱符合所选操作条件，验证码将发送至 {email}，15 分钟内有效。未收到邮件时，请检查垃圾邮件和所选操作。</p>
      <input type="hidden" name="username" autoComplete="username" value={email} />
      <label htmlFor="code">邮箱验证码</label>
      <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" required maxLength={6}
        value={code} placeholder="6 位数字" autoFocus disabled={pending} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} />
      <PasswordField id="password" label="设置密码" newPassword disabled={pending} />
      <PasswordField id="confirmPassword" label="确认密码" newPassword disabled={pending} />
      {error && <p className="form-error" role="alert">{error}</p>}
      <button type="submit" disabled={pending || code.length !== 6}>{pending ? "正在验证…" : "验证并设置密码"}</button>
      <div className="code-actions">
        <button type="button" className="link-button" disabled={pending || cooldownSeconds > 0} onClick={resendCode}>
          {cooldownSeconds > 0 ? `重新发送（${cooldownSeconds}s）` : "重新发送"}
        </button>
        <button type="button" className="link-button" disabled={pending} onClick={() => switchMode(mode)}>返回修改邮箱</button>
        <button type="button" className="link-button" disabled={pending} onClick={() => switchMode("login")}>返回密码登录</button>
      </div>
    </form>;
  }

  if (step === "nickname") {
    return (
      <form className="identity-form" onSubmit={submitNickname}>
        <label htmlFor="nickname">设置昵称</label>
        <input
          id="nickname"
          name="nickname"
          autoComplete="nickname"
          required
          maxLength={80}
          value={nickname}
          placeholder="朋友看到的名字"
          autoFocus
          onChange={(event) => setNickname(event.target.value)}
        />
        <label htmlFor="first-school" style={{ marginTop: 14, display: "block" }}>我的学校（可选）</label>
        <ThemedSelect
          searchable
          value={schoolId}
          ariaLabel="我的学校"
          placeholder="输入学校名筛选，如：复旦"
          emptyText="没有找到这所学校"
          emptyFooter={schoolPickerEmptyFooter(() => setSchoolId("custom"))}
          groups={[
            ...[{ label: "按小节排课（一节 40–50 分钟）" }, { label: "按大节排课（一节 80 分钟以上）" }].map((group) => ({
              label: group.label,
              options: listSchedulePresets().filter((preset) => (group.label.startsWith("按小节") ? preset.kind === "period" : preset.kind === "block")).map((preset) => ({ value: preset.id, label: preset.school + (preset.variant ? "（" + preset.variant + "）" : "") })),
            })),
            { label: "其他", options: [{ value: "custom", label: "其他学校（手动添加课表）" }, { value: "__skip__", label: "暂不设置，之后再选" }] },
          ]}
          onChange={setSchoolId}
        />
        <small style={{ color: "var(--text-tertiary)", fontSize: 12 }}>决定课表节次网格与导入模板；选「其他学校」进入应用后会引导你完成设置：填好每节课的起止时间并提交学校名称，即可导入课表，学校也会进入人工审核队列。</small>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="submit" disabled={pending || !nickname.trim()}>{pending ? "正在保存…" : "完成并进入"}</button>
        <div className="code-actions">
          <button type="button" className="link-button" disabled={pending} onClick={enter}>跳过，稍后在设置中修改</button>
        </div>
      </form>
    );
  }

  return <form className="identity-form" onSubmit={submitEmail} key={mode}>
    {mode !== "login" && <>
      <h2 className="auth-mode-title">{labels[mode]}</h2>
      <p className="auth-mode-note">{notes[mode]}</p>
    </>}
    <label htmlFor="email">邮箱</label>
    <input id="email" name="username" type="email" autoComplete="username" required maxLength={320}
      placeholder="name@example.com" value={email} disabled={pending} onChange={(event) => setEmail(event.target.value)} />
    {mode === "login" && <PasswordField id="password" label="密码" disabled={pending} />}
    {error && <p className="form-error" role="alert">{error}</p>}
    <button type="submit" disabled={pending}>{pending ? "正在处理…" : mode === "login" ? "登录" : "获取邮箱验证码"}</button>
    <div className="auth-links">
      {mode === "login" ? <>
        <button type="button" className="link-button" disabled={pending} onClick={() => switchMode("REGISTER")}>注册账号</button>
        <button type="button" className="link-button" disabled={pending} onClick={() => switchMode("SET_PASSWORD")}>老账号首次设密码</button>
        <button type="button" className="link-button" disabled={pending} onClick={() => switchMode("RESET_PASSWORD")}>忘记密码</button>
      </> : <button type="button" className="link-button" disabled={pending} onClick={() => switchMode("login")}>返回密码登录</button>}
    </div>
  </form>;
}
