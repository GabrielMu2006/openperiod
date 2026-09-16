"use client";

import { useEffect, useState } from "react";
import { ThemedSelect } from "@/components/themed-select";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";

interface GroupDTO {
  id: string;
  name: string;
  inviteCode: string;
  role: "OWNER" | "MEMBER";
  privacyLevel: 0 | 1 | 2 | null;
  members: { id: string; nickname: string }[];
}

const privacyLabels: Record<number, string> = { 0: "仅忙 / 闲", 1: "课程名称", 2: "完整课程" };

export function GroupsDashboard() {
  const router = useRouter();
  const [groups, setGroups] = useState<GroupDTO[] | null>(null);
  const [defaultPrivacyLevel, setDefaultPrivacyLevel] = useState<number>(1);
  const [error, setError] = useState("");
  const [updating, setUpdating] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/groups", { signal: controller.signal }).then(async (response) => {
      if (response.status === 401) {
        router.replace("/login");
        return;
      }
      if (!response.ok) throw new Error("暂时无法读取群组");
      const body = (await response.json()) as { groups: GroupDTO[]; defaultPrivacyLevel?: number };
      setGroups(body.groups);
      if (typeof body.defaultPrivacyLevel === "number") setDefaultPrivacyLevel(body.defaultPrivacyLevel);
    }).catch((cause) => {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setGroups(null);
      setError(cause instanceof Error ? cause.message : "暂时无法读取群组");
    });
    return () => controller.abort();
  }, [router, reloadKey]);

  async function regenerate(groupId: string) {
    setUpdating(groupId);
    setError("");
    try {
      const response = await fetch(`/api/groups/${groupId}/invite-code`, { method: "POST" });
      const body = (await response.json()) as { inviteCode?: string; error?: string };
      if (!response.ok || !body.inviteCode) throw new Error(body.error ?? "无法更新邀请码");
      setGroups((current) => current?.map((group) => group.id === groupId ? { ...group, inviteCode: body.inviteCode! } : group) ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法更新邀请码");
    } finally {
      setUpdating("");
    }
  }

  async function changePrivacy(groupId: string, value: string) {
    setUpdating(`privacy-${groupId}`);
    setError("");
    const privacyLevel = value === "default" ? null : Number(value) as 0 | 1 | 2;
    try {
      const response = await fetch(`/api/groups/${groupId}/privacy`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ privacyLevel }),
      });
      if (!response.ok) throw new Error("无法更新群组隐私设置");
      setGroups((current) => current?.map((group) => group.id === groupId ? { ...group, privacyLevel } : group) ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法更新群组隐私设置");
    } finally {
      setUpdating("");
    }
  }

  return (
    <AppShell active="groups">
      <div className="groups-content">
        <div className="groups-heading"><div><p className="eyebrow">GROUPS</p><h1>群组</h1><p>和熟悉的人共享忙闲状态，课程细节由你决定。</p></div><div><a href="/join">输入邀请码</a><a className="primary-action" href="/groups/new">创建群组</a></div></div>
        {error && <div className="page-error" role="alert">{error}<button type="button" onClick={() => { setError(""); setReloadKey((key) => key + 1); }}>重试</button></div>}
        {groups === null && !error ? <div className="groups-grid"><div className="group-card loading-panel" /></div> : groups !== null && groups.length === 0 ? <section className="workspace empty-state"><span className="logo-mark"><i /><i /></span><h2>还没有群组</h2><p>创建一个群组，或者输入朋友的邀请码。</p></section> : groups !== null && groups.length > 0 ? <div className="groups-grid">{groups.map((group) => <article className="group-card" key={group.id}><div className="group-card-heading"><div><h2>{group.name}</h2><span>{group.members.length} 位成员</span></div><small>{group.role === "OWNER" ? "群主" : "成员"}</small></div><p className="member-list">{group.members.map((member) => member.nickname).join(" · ")}</p><div className="invite-row"><span>邀请码</span><strong>{group.inviteCode}</strong>{group.role === "OWNER" && <button type="button" disabled={updating === group.id} onClick={() => regenerate(group.id)}>{updating === group.id ? "更新中" : "重新生成"}</button>}</div><label className="group-privacy-row"><span>这个群组看到我的</span><ThemedSelect
                value={String(group.privacyLevel ?? "default")}
                disabled={updating === "privacy-" + group.id}
                ariaLabel="这个群组看到我的"
                groups={[{ options: [
                  { value: "default", label: "跟随默认设置" },
                  { value: "0", label: "仅忙 / 闲" },
                  { value: "1", label: "课程名称" },
                  { value: "2", label: "完整课程" },
                ] }]}
                onChange={(next) => changePrivacy(group.id, next)}
              /><small className="privacy-effective">{group.privacyLevel === null ? `当前生效（跟随默认）：${privacyLabels[defaultPrivacyLevel]}` : `当前生效：${privacyLabels[group.privacyLevel]}`}</small></label><a className="view-group" href={`/?group=${group.id}`}>查看共同空闲 <span>→</span></a></article>)}</div> : null}
      </div>
    </AppShell>
  );
}
