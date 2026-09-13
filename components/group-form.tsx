"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

interface GroupFormProps {
  mode: "create" | "join";
  initialCode?: string;
}

const privacyOptions = [
  { value: "0", title: "仅显示忙 / 闲", description: "别人只知道这个时间能不能约。" },
  { value: "1", title: "显示课程名称", description: "显示课程名，不显示教师和地点。" },
  { value: "2", title: "显示完整课程", description: "可以显示课程、教师和上课地点。" },
];

export function GroupForm({ mode, initialCode = "" }: GroupFormProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const privacyLevel = Number(form.get("privacyLevel")) as 0 | 1 | 2;
    const body = mode === "create"
      ? { name: form.get("name"), privacyLevel }
      : { code: form.get("code"), privacyLevel };

    try {
      const response = await fetch(mode === "create" ? "/api/groups" : "/api/groups/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as { group?: { id: string }; error?: string };
      if (response.status === 401) {
        router.replace("/login");
        return;
      }
      if (!response.ok || !result.group) throw new Error(result.error ?? "暂时无法保存群组");
      router.replace(`/?group=${result.group.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "暂时无法保存群组");
      setPending(false);
    }
  }

  return (
    <form className="group-form" onSubmit={submit}>
      {mode === "create" ? (
        <label className="field-label" htmlFor="group-name">群组名称<input id="group-name" name="name" required maxLength={80} placeholder="例如：宿舍、吃饭搭子" /></label>
      ) : (
        <label className="field-label" htmlFor="invite-code">邀请码<input id="invite-code" name="code" required minLength={6} maxLength={12} defaultValue={initialCode} autoCapitalize="characters" placeholder="7FQ9K2" /></label>
      )}
      <fieldset className="privacy-options"><legend>在这个群组中，别人可以看到</legend>{privacyOptions.map((option, index) => <label key={option.value}><input type="radio" name="privacyLevel" value={option.value} defaultChecked={index === 0} /><span><strong>{option.title}</strong><small>{option.description}</small></span></label>)}</fieldset>
      <p className="privacy-notice">“本周不去”和私人忙碌标题永远不会公开。</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions"><a href="/groups">取消</a><button type="submit" disabled={pending}>{pending ? "正在保存…" : mode === "create" ? "创建群组" : "加入群组"}</button></div>
    </form>
  );
}
