"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function IdentityForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");

    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/identify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nickname: form.get("nickname"), email: form.get("email") }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "暂时无法创建身份");
      router.replace("/");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "暂时无法创建身份");
      setPending(false);
    }
  }

  return (
    <form className="identity-form" onSubmit={submit}>
      <label htmlFor="nickname">昵称</label>
      <input id="nickname" name="nickname" autoComplete="nickname" required maxLength={80} placeholder="朋友看到的名字" />
      <label htmlFor="email">邮箱</label>
      <input id="email" name="email" type="email" autoComplete="email" required maxLength={320} placeholder="name@pku.edu.cn" />
      {error && <p className="form-error" role="alert">{error}</p>}
      <button type="submit" disabled={pending}>{pending ? "正在进入…" : "开始使用"}</button>
    </form>
  );
}
