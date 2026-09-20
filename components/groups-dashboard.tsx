"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "@phosphor-icons/react";
import { AppShell } from "@/components/app-shell";
import { LoadingState } from "@/components/loading-state";
import { ThemedSelect } from "@/components/themed-select";

interface GroupDTO {
  id: string;
  name: string;
  inviteCode: string;
  role: "OWNER" | "MEMBER";
  archivedAt: string | null;
  privacyLevel: 0 | 1 | 2 | null;
  members: { id: string; nickname: string; role: "OWNER" | "MEMBER" }[];
}

const privacyLabels: Record<number, string> = { 0: "仅忙 / 闲", 1: "课程名称", 2: "完整课程" };

async function readError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null) as { error?: string } | null;
  return body?.error ?? fallback;
}

export function GroupsDashboard() {
  const router = useRouter();
  const [groups, setGroups] = useState<GroupDTO[] | null>(null);
  const [defaultPrivacyLevel, setDefaultPrivacyLevel] = useState<number>(1);
  const [error, setError] = useState("");
  const [updating, setUpdating] = useState("");
  const [managingId, setManagingId] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setError("");
    fetch("/api/groups?includeArchived=1", { signal: controller.signal }).then(async (response) => {
      if (response.status === 401) {
        router.replace("/login");
        return;
      }
      if (!response.ok) throw new Error(await readError(response, "暂时无法读取群组"));
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

  function refresh() {
    setManagingId("");
    setReloadKey((key) => key + 1);
  }

  async function mutate(key: string, url: string, init: RequestInit, fallback: string) {
    setUpdating(key);
    setError("");
    try {
      const response = await fetch(url, init);
      if (!response.ok) throw new Error(await readError(response, fallback));
      refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : fallback);
    } finally {
      setUpdating("");
    }
  }

  async function regenerate(groupId: string) {
    setUpdating(`invite-${groupId}`);
    setError("");
    try {
      const response = await fetch(`/api/groups/${groupId}/invite-code`, { method: "POST" });
      if (!response.ok) throw new Error(await readError(response, "无法更新邀请码"));
      const body = (await response.json()) as { inviteCode: string };
      setGroups((current) => current?.map((group) => group.id === groupId
        ? { ...group, inviteCode: body.inviteCode }
        : group) ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法更新邀请码");
    } finally {
      setUpdating("");
    }
  }

  async function changePrivacy(groupId: string, value: string) {
    const privacyLevel = value === "default" ? null : Number(value) as 0 | 1 | 2;
    setUpdating(`privacy-${groupId}`);
    setError("");
    try {
      const response = await fetch(`/api/groups/${groupId}/privacy`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ privacyLevel }),
      });
      if (!response.ok) throw new Error(await readError(response, "无法更新群组隐私设置"));
      setGroups((current) => current?.map((group) => group.id === groupId
        ? { ...group, privacyLevel }
        : group) ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法更新群组隐私设置");
    } finally {
      setUpdating("");
    }
  }

  function rename(group: GroupDTO) {
    const name = nameDraft.trim();
    if (!name || name === group.name) return;
    void mutate(`rename-${group.id}`, `/api/groups/${group.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "rename", name }),
    }, "无法修改群组名称");
  }

  function archive(group: GroupDTO, archived: boolean) {
    if (archived && !window.confirm(`归档“${group.name}”？\n\n成员、隐私设置和历史课表都会保留，邀请码与共同空闲入口会暂停，之后可随时恢复。`)) return;
    void mutate(`archive-${group.id}`, `/api/groups/${group.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "archive", archived }),
    }, archived ? "无法归档群组" : "无法恢复群组");
  }

  function leave(group: GroupDTO) {
    if (!window.confirm(`退出“${group.name}”？\n\n只会移除你在这个群组中的成员关系和群内隐私设置，不会删除账号或个人课表。`)) return;
    void mutate(`leave-${group.id}`, `/api/groups/${group.id}`, { method: "DELETE" }, "无法退出群组");
  }

  function removeMember(group: GroupDTO, member: GroupDTO["members"][number]) {
    if (!window.confirm(`将“${member.nickname}”移出“${group.name}”？\n\n只会移除群组成员关系和群内隐私设置，不会删除对方账号或课表。`)) return;
    void mutate(`remove-${member.id}`, `/api/groups/${group.id}/members/${member.id}`, {
      method: "DELETE",
    }, "无法移出成员");
  }

  function transfer(group: GroupDTO, member: GroupDTO["members"][number]) {
    if (!window.confirm(`把“${group.name}”的群主转让给“${member.nickname}”？\n\n转让后你会成为普通成员。自定义作息群仅允许转让给作息完全相同的成员。`)) return;
    void mutate(`transfer-${member.id}`, `/api/groups/${group.id}/members/${member.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "OWNER" }),
    }, "无法转让群主");
  }

  const activeGroups = groups?.filter((group) => !group.archivedAt) ?? [];
  const archivedGroups = groups?.filter((group) => group.archivedAt) ?? [];

  function renderGroup(group: GroupDTO) {
    const archived = Boolean(group.archivedAt);
    const managing = managingId === group.id;
    return (
      <article className={`group-card${archived ? " archived" : ""}`} key={group.id}>
        <div className="group-card-heading">
          <div><h2>{group.name}</h2><span>{group.members.length} 位成员{archived ? " · 已归档" : ""}</span></div>
          <small>{group.role === "OWNER" ? "群主" : "成员"}</small>
        </div>
        <p className="member-list">{group.members.map((member) => member.nickname).join(" · ")}</p>

        {archived ? (
          <div className="group-archive-note">群组数据和成员关系均已保留。恢复后邀请码和共同空闲会重新开放。</div>
        ) : (
          <>
            <div className="invite-row">
              <span>邀请码</span><strong>{group.inviteCode}</strong>
              {group.role === "OWNER" && <button type="button" disabled={updating === `invite-${group.id}`} onClick={() => regenerate(group.id)}>{updating === `invite-${group.id}` ? "更新中" : "重新生成"}</button>}
            </div>
            <label className="group-privacy-row"><span>这个群组看到我的</span><ThemedSelect
              value={String(group.privacyLevel ?? "default")}
              disabled={updating === `privacy-${group.id}`}
              ariaLabel="这个群组看到我的"
              groups={[{ options: [
                { value: "default", label: "跟随默认设置" },
                { value: "0", label: "仅忙 / 闲" },
                { value: "1", label: "课程名称" },
                { value: "2", label: "完整课程" },
              ] }]}
              onChange={(next) => changePrivacy(group.id, next)}
            /><small className="privacy-effective">{group.privacyLevel === null ? `当前生效（跟随默认）：${privacyLabels[defaultPrivacyLevel]}` : `当前生效：${privacyLabels[group.privacyLevel]}`}</small></label>
            <a className="view-group" href={`/?group=${group.id}`}>查看共同空闲 <span aria-hidden="true"><ArrowRight className="ui-icon" weight="bold" /></span></a>
          </>
        )}

        <div className="group-card-actions">
          {group.role === "OWNER" && !archived && <button type="button" onClick={() => {
            setManagingId(managing ? "" : group.id);
            setNameDraft(group.name);
          }}>{managing ? "收起管理" : "管理群组"}</button>}
          {group.role === "OWNER" && archived && <button type="button" disabled={updating === `archive-${group.id}`} onClick={() => archive(group, false)}>{updating === `archive-${group.id}` ? "恢复中" : "恢复群组"}</button>}
          {group.role === "MEMBER" && <button className="danger-link" type="button" disabled={updating === `leave-${group.id}`} onClick={() => leave(group)}>{updating === `leave-${group.id}` ? "退出中" : "退出群组"}</button>}
        </div>

        {managing && !archived && <section className="group-manage" aria-label={`管理 ${group.name}`}>
          <div className="group-name-editor">
            <label htmlFor={`group-name-${group.id}`}>群组名称</label>
            <div><input id={`group-name-${group.id}`} maxLength={80} value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} /><button type="button" disabled={!nameDraft.trim() || nameDraft.trim() === group.name || updating === `rename-${group.id}`} onClick={() => rename(group)}>{updating === `rename-${group.id}` ? "保存中" : "保存"}</button></div>
          </div>
          <div className="group-member-manager">
            <h3>成员管理</h3>
            {group.members.map((member) => <div className="group-member-row" key={member.id}>
              <span>{member.nickname}{member.role === "OWNER" && <small>群主</small>}</span>
              {member.role === "MEMBER" && <div><button type="button" disabled={Boolean(updating)} onClick={() => transfer(group, member)}>转让群主</button><button className="danger-link" type="button" disabled={Boolean(updating)} onClick={() => removeMember(group, member)}>移出</button></div>}
            </div>)}
          </div>
          <div className="group-danger-zone">
            <div><strong>归档群组</strong><small>暂停邀请码和共同空闲，保留全部数据，可随时恢复。</small></div>
            <button type="button" disabled={updating === `archive-${group.id}`} onClick={() => archive(group, true)}>{updating === `archive-${group.id}` ? "归档中" : "归档"}</button>
          </div>
        </section>}
      </article>
    );
  }

  return (
    <AppShell active="groups">
      <div className="groups-content">
        <div className="groups-heading"><div><p className="eyebrow">GROUPS</p><h1>群组</h1><p>和熟悉的人共享忙闲状态，课程细节由你决定。</p></div><div><a href="/join">输入邀请码</a><a className="primary-action" href="/groups/new">创建群组</a></div></div>
        {error && <div className="page-error" role="alert">{error}<button type="button" onClick={() => { setError(""); setReloadKey((key) => key + 1); }}>重试</button></div>}
        {groups === null && !error ? <div className="groups-grid"><div className="group-card loading-panel"><LoadingState label="正在加载群组…" compact /></div></div> : null}
        {groups !== null && activeGroups.length === 0 ? <section className="workspace empty-state"><span className="logo-mark"><i /><i /></span><h2>还没有使用中的群组</h2><p>创建一个群组，或者输入朋友的邀请码。</p></section> : null}
        {activeGroups.length > 0 && <section><h2 className="groups-section-title">使用中的群组</h2><div className="groups-grid">{activeGroups.map(renderGroup)}</div></section>}
        {archivedGroups.length > 0 && <section className="archived-groups"><h2 className="groups-section-title">已归档</h2><div className="groups-grid">{archivedGroups.map(renderGroup)}</div></section>}
      </div>
    </AppShell>
  );
}
