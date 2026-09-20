"use client";

import { useState, type FormEvent } from "react";
import { PasswordField } from "@/components/password-field";

export function PasswordSettings({ email }: { email: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setError("");
    setSaved(false);
    if (data.get("password") !== data.get("confirmPassword")) { setError("两次输入的新密码不一致"); return; }
    setPending(true);
    try {
      const response = await fetch("/api/auth/password", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword: data.get("currentPassword"), password: data.get("password") }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "修改失败");
      form.reset();
      setSaved(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "修改失败"); }
    finally { setPending(false); }
  }
  return <section className="settings-card" aria-labelledby="settings-password">
    <h2 id="settings-password">登录密码</h2>
    <p className="settings-note">修改密码后，本设备保持登录，其他设备需要用新密码重新登录。</p>
    <form className="identity-form" onSubmit={submit}>
      <input type="hidden" name="username" autoComplete="username" value={email} />
      <PasswordField id="currentPassword" label="当前密码" disabled={pending} />
      <PasswordField id="password" label="新密码" newPassword disabled={pending} />
      <PasswordField id="confirmPassword" label="确认新密码" newPassword disabled={pending} />
      {error && <p className="form-error" role="alert">{error}</p>}
      {saved && <p className="settings-saved" role="status">密码已修改，其他设备的旧会话已失效。</p>}
      <button type="submit" disabled={pending}>{pending ? "正在修改…" : "修改密码"}</button>
    </form>
    <p className="settings-note">忘记当前密码？<a href="/login?mode=RESET_PASSWORD">通过邮箱找回</a></p>
  </section>;
}
