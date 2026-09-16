"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { listSchedulePresets } from "@/src/config/school-schedules";
import { ThemedSelect } from "@/components/themed-select";

type Step = "email" | "code" | "nickname";

export function IdentityForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [nickname, setNickname] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (step !== "code") return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [step]);

  function enter() {
    router.replace("/");
    router.refresh();
  }

  async function submitEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");

    const form = new FormData(event.currentTarget);
    const input = String(form.get("email") ?? "");
    try {
      const response = await fetch("/api/auth/identify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: input }),
      });
      const body = (await response.json()) as { error?: string; verificationRequired?: boolean; email?: string; user?: { nickname: string }; needsNickname?: boolean };
      if (!response.ok) throw new Error(body.error ?? "暂时无法登录");
      setEmail(body.email ?? input);
      if (body.verificationRequired) {
        setCode("");
        setCooldownUntil(Date.now() + 60_000);
        setStep("code");
        setPending(false);
        return;
      }
      if (body.needsNickname && body.user) {
        setNickname(body.user.nickname);
        setStep("nickname");
        setPending(false);
        return;
      }
      enter();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "暂时无法登录");
      setPending(false);
    }
  }

  async function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const body = (await response.json()) as { error?: string; user?: { nickname: string }; needsNickname?: boolean };
      if (!response.ok) throw new Error(body.error ?? "验证失败");
      if (body.needsNickname && body.user) {
        setNickname(body.user.nickname);
        setStep("nickname");
        setPending(false);
        return;
      }
      enter();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "验证失败");
      setPending(false);
    }
  }

  async function submitNickname(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/auth/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nickname, ...(listSchedulePresets().some((preset) => preset.id === schoolId) ? { scheduleId: schoolId } : {}) }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "保存昵称失败");
      enter();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存昵称失败");
      setPending(false);
    }
  }

  async function resendCode() {
    if (Date.now() < cooldownUntil) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/auth/resend", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "重新发送失败");
      setCooldownUntil(Date.now() + 60_000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "重新发送失败");
    } finally {
      setPending(false);
    }
  }

  if (step === "code") {
    const cooldownSeconds = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));
    return (
      <form className="identity-form" onSubmit={submitCode}>
        <label htmlFor="code">验证码</label>
        <input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          required
          maxLength={6}
          value={code}
          placeholder="6 位数字"
          autoFocus
          onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
        />
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="submit" disabled={pending || code.length !== 6}>{pending ? "正在验证…" : "验证并登录"}</button>
        <p className="code-hint">验证码已发送至 {email}，15 分钟内有效。</p>
        <div className="code-actions">
          <button type="button" className="link-button" disabled={pending || cooldownSeconds > 0} onClick={resendCode}>
            {cooldownSeconds > 0 ? `重新发送（${cooldownSeconds}s）` : "重新发送"}
          </button>
          <button type="button" className="link-button" onClick={() => { setStep("email"); setError(""); setCode(""); }}>返回修改邮箱</button>
        </div>
      </form>
    );
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
          emptyText="没有匹配的学校，可选「其他」"
          groups={[
            ...[{ label: "按小节排课（一节 40–50 分钟）" }, { label: "按大节排课（一节 80 分钟以上）" }].map((group) => ({
              label: group.label,
              options: listSchedulePresets().filter((preset) => (group.label.startsWith("按小节") ? preset.kind === "period" : preset.kind === "block")).map((preset) => ({ value: preset.id, label: preset.school + (preset.variant ? "（" + preset.variant + "）" : "") })),
            })),
            { label: "其他", options: [{ value: "__unset__", label: "其他（列表里没有我的学校）" }, { value: "__skip__", label: "暂不设置，之后再选" }] },
          ]}
          onChange={setSchoolId}
        />
        <small style={{ color: "var(--text-tertiary)", fontSize: 12 }}>决定课表节次网格与导入模板；选「其他/暂不设置」将按默认（北大）节次处理，之后可随时在设置中修改。</small>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="submit" disabled={pending || !nickname.trim()}>{pending ? "正在保存…" : "完成并进入"}</button>
        <div className="code-actions">
          <button type="button" className="link-button" disabled={pending} onClick={enter}>跳过，稍后在设置中修改</button>
        </div>
      </form>
    );
  }

  return (
    <form className="identity-form" onSubmit={submitEmail}>
      <label htmlFor="email">邮箱</label>
      <input id="email" name="email" type="email" autoComplete="email" required maxLength={320} placeholder="name@example.com" defaultValue={email} />
      {error && <p className="form-error" role="alert">{error}</p>}
      <button type="submit" disabled={pending}>{pending ? "正在进入…" : "继续"}</button>
    </form>
  );
}
