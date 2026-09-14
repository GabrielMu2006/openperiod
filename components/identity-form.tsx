"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function IdentityForm() {
  const router = useRouter();
  const [step, setStep] = useState<"form" | "code">("form");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (step !== "code") return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [step]);

  async function submitIdentity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");

    const form = new FormData(event.currentTarget);
    const identity = {
      nickname: String(form.get("nickname") ?? ""),
      email: String(form.get("email") ?? ""),
    };
    try {
      const response = await fetch("/api/auth/identify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(identity),
      });
      const body = (await response.json()) as { error?: string; verificationRequired?: boolean; email?: string };
      if (!response.ok) throw new Error(body.error ?? "暂时无法创建身份");
      if (body.verificationRequired) {
        setNickname(identity.nickname);
        setEmail(body.email ?? identity.email);
        setCode("");
        setCooldownUntil(Date.now() + 60_000);
        setStep("code");
        setPending(false);
        return;
      }
      router.replace("/");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "暂时无法创建身份");
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
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "验证失败");
      router.replace("/");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "验证失败");
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
          <button type="button" className="link-button" onClick={() => { setStep("form"); setError(""); setCode(""); }}>返回修改邮箱</button>
        </div>
      </form>
    );
  }

  return (
    <form className="identity-form" onSubmit={submitIdentity}>
      <label htmlFor="nickname">昵称</label>
      <input id="nickname" name="nickname" autoComplete="nickname" required maxLength={80} placeholder="朋友看到的名字" defaultValue={nickname} />
      <label htmlFor="email">邮箱</label>
      <input id="email" name="email" type="email" autoComplete="email" required maxLength={320} placeholder="name@pku.edu.cn" defaultValue={email} />
      {error && <p className="form-error" role="alert">{error}</p>}
      <button type="submit" disabled={pending}>{pending ? "正在进入…" : "开始使用"}</button>
    </form>
  );
}
