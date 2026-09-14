"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { useDialogBehavior } from "@/components/dialog-behavior";
import { WEEKDAYS, type AvailabilitySlot, type Weekday } from "@/src/domain/schedule";

const weekdayLabels: Record<Weekday, string> = {
  monday: "一", tuesday: "二", wednesday: "三", thursday: "四",
  friday: "五", saturday: "六", sunday: "日",
};

interface GroupDTO {
  id: string;
  name: string;
  inviteCode: string;
  role: "OWNER" | "MEMBER";
  privacyLevel: 0 | 1 | 2 | null;
  semester: { academicYear: string; semester: string; currentWeek: number; weekCount: number };
  members: { id: string; nickname: string }[];
}

interface GridResponse {
  week: number;
  selectedUsers: number;
  slots: Record<Weekday, Record<string, { commonFree: boolean }>>;
}

type SelectedSlot = { weekday: Weekday; period: number; slot: AvailabilitySlot };

function Logo() {
  return <span className="logo-mark" aria-hidden="true"><i /><i /></span>;
}

function currentUrlSearchParams() {
  return new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
}

export function CommonAvailability() {
  const router = useRouter();
  const [groups, setGroups] = useState<GroupDTO[] | null>(null);
  const [activeGroupId, setActiveGroupId] = useState("");
  const [week, setWeek] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [grid, setGrid] = useState<GridResponse | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<SelectedSlot | null>(null);
  const [loadingDetail, setLoadingDetail] = useState("");
  const [error, setError] = useState("");
  const detailRef = useDialogBehavior(selectedSlot !== null, () => setSelectedSlot(null));

  const activeGroup = useMemo(
    () => groups?.find((group) => group.id === activeGroupId) ?? null,
    [activeGroupId, groups],
  );

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/groups", { signal: controller.signal }).then(async (response) => {
      if (response.status === 401) {
        router.replace("/login");
        return;
      }
      if (!response.ok) throw new Error("暂时无法读取群组数据");
      const groupBody = (await response.json()) as { groups: GroupDTO[] };
      setGroups(groupBody.groups);
      if (groupBody.groups.length) {
        // 群组/教学周/成员筛选优先从链接恢复，缺失时回落到当前群组的默认视图
        const params = currentUrlSearchParams();
        const requested = params.get("group");
        const initial = groupBody.groups.find((group) => group.id === requested) ?? groupBody.groups[0];
        setActiveGroupId(initial.id);
        const weekParam = Number(params.get("week"));
        setWeek(Number.isInteger(weekParam) && weekParam >= 1 && weekParam <= initial.semester.weekCount
          ? weekParam
          : initial.semester.currentWeek);
        const usersParam = params.get("users");
        const requestedIds = usersParam
          ? usersParam.split(",").filter((id) => initial.members.some((member) => member.id === id))
          : [];
        setSelectedIds(requestedIds.length ? requestedIds : initial.members.map((member) => member.id));
      }
    }).catch((cause) => {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setGroups([]);
      setError(cause instanceof Error ? cause.message : "暂时无法读取群组数据");
    });
    return () => controller.abort();
  }, [router]);

  // 视图状态写入链接：刷新、返回、分享链接都保留当前群组、教学周和成员筛选
  useEffect(() => {
    if (!activeGroup) return;
    const params = currentUrlSearchParams();
    params.set("group", activeGroup.id);
    params.set("week", String(week));
    const allSelected = selectedIds.length === activeGroup.members.length;
    if (allSelected || selectedIds.length === 0) params.delete("users");
    else params.set("users", selectedIds.join(","));
    const query = params.toString();
    window.history.replaceState(null, "", `/${query ? `?${query}` : ""}`);
  }, [activeGroup, week, selectedIds]);

  useEffect(() => {
    if (!activeGroup || selectedIds.length === 0) {
      setGrid(null);
      return;
    }
    const controller = new AbortController();
    setGrid(null);
    setError("");
    const query = new URLSearchParams({ week: String(week), users: selectedIds.join(",") });
    fetch(`/api/groups/${activeGroup.id}/availability?${query}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("暂时无法计算共同空闲");
        setGrid((await response.json()) as GridResponse);
      })
      .catch((cause) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "暂时无法计算共同空闲");
      });
    return () => controller.abort();
  }, [activeGroup, selectedIds, week]);

  function changeGroup(groupId: string) {
    const group = groups?.find((candidate) => candidate.id === groupId);
    if (!group) return;
    setActiveGroupId(group.id);
    setWeek(group.semester.currentWeek);
    setSelectedIds(group.members.map((member) => member.id));
    setSelectedSlot(null);
  }

  function toggleMember(userId: string) {
    setSelectedIds((current) => current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]);
    setSelectedSlot(null);
  }

  async function openDetails(weekday: Weekday, period: number) {
    if (!activeGroup || !selectedIds.length) return;
    const key = `${weekday}-${period}`;
    setLoadingDetail(key);
    const query = new URLSearchParams({ week: String(week), weekday, period: String(period), users: selectedIds.join(",") });
    try {
      const response = await fetch(`/api/groups/${activeGroup.id}/availability/details?${query}`);
      if (!response.ok) throw new Error("暂时无法读取时段详情");
      setSelectedSlot({ weekday, period, slot: (await response.json()) as AvailabilitySlot });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "暂时无法读取时段详情");
    } finally {
      setLoadingDetail("");
    }
  }

  const noGroups = groups !== null && groups.length === 0 && !error;
  const members = activeGroup?.members ?? [];

  return (
    <AppShell
      active="availability"
      topbarCenter={activeGroup && <span className="group-quick">{activeGroup.name}</span>}
      sidebarNote={activeGroup && <div className="semester-note"><span />{activeGroup.semester.academicYear} {activeGroup.semester.semester.replace("学期", "")}<br /><small>第 {week} 周</small></div>}
    >
      <div className="page-heading"><div><p className="eyebrow">COMMON AVAILABILITY</p><h1>共同空闲</h1></div><p>找到所有人都能赴约的课间空档。</p></div>
      {error && <div className="page-error" role="alert">{error}</div>}

      {groups === null ? (
        <section className="workspace loading-panel" aria-label="正在加载"><div className="loading-line" /><div className="loading-line short" /></section>
      ) : noGroups ? (
        <section className="workspace empty-state"><Logo /><h2>还没有群组</h2><p>创建一个群组，或者输入朋友发来的邀请码。</p><div className="empty-actions"><a className="primary-action" href="/groups/new">创建群组</a><a href="/join">加入群组</a></div></section>
      ) : activeGroup ? (
        <section className="workspace" aria-label="共同空闲课表">
          <div className="controls">
            <label className="group-control"><span>群组</span><select value={activeGroup.id} onChange={(event) => changeGroup(event.target.value)}>{groups.map((group) => <option value={group.id} key={group.id}>{group.name} · {group.members.length} 人</option>)}</select></label>
            <div className="week-control" aria-label="教学周"><span>教学周</span><div><button type="button" disabled={week === 1} onClick={() => setWeek((value) => Math.max(1, value - 1))} aria-label="上一周">‹</button><button className="week-value" type="button">第 {week} 周 {week === activeGroup.semester.currentWeek && <em>本周</em>}</button><button type="button" disabled={week === activeGroup.semester.weekCount} onClick={() => setWeek((value) => Math.min(activeGroup.semester.weekCount, value + 1))} aria-label="下一周">›</button></div></div>
          </div>

          <div className="member-bar"><div><strong>参与成员</strong><span>已选择 {selectedIds.length} / {members.length} 人</span></div><div className="member-chips"><button type="button" className={selectedIds.length === members.length ? "selected" : ""} onClick={() => setSelectedIds(selectedIds.length === members.length ? [] : members.map((member) => member.id))}>{selectedIds.length === members.length ? "取消全选" : "全选"}</button>{members.map((member) => { const selected = selectedIds.includes(member.id); return <button type="button" className={selected ? "selected" : ""} aria-pressed={selected} onClick={() => toggleMember(member.id)} key={member.id}>{selected && <span>✓</span>}{member.nickname}</button>; })}</div></div>

          {selectedIds.length === 0 ? <div className="empty-state"><Logo /><h2>请选择至少一位成员</h2><p>选择成员后，这里会立即显示共同空闲。</p></div> : (
            <div className="timetable-wrap"><div className="legend"><span><i className="free" />共同空闲</span><span><i className="busy" />有人忙碌</span><small>点击格子查看成员状态</small></div><div className="grid-scroller"><div className="timetable-grid"><div className="corner">节次</div>{WEEKDAYS.map((day) => <div className="day-heading" key={day}>周{weekdayLabels[day]}</div>)}{Array.from({ length: 12 }, (_, index) => index + 1).flatMap((period) => [<div className="period" key={`period-${period}`}><strong>{period}</strong><span>第 {period} 节</span></div>, ...WEEKDAYS.map((weekday) => { const state = grid?.slots[weekday]?.[String(period)]; const loading = !state; const key = `${weekday}-${period}`; return <button type="button" key={key} className={`slot ${loading ? "slot-loading" : state.commonFree ? "slot-free" : "slot-busy"}`} aria-label={`周${weekdayLabels[weekday]}第 ${period} 节，${loading ? "正在计算" : state.commonFree ? "所有人共同空闲" : "有人忙碌"}`} disabled={loading} onClick={() => openDetails(weekday, period)}>{loadingDetail === key ? <span>…</span> : state?.commonFree ? <span aria-hidden="true">✓</span> : <i aria-hidden="true" />}</button>; })])}</div></div></div>
          )}
        </section>
      ) : null}

      {selectedSlot && <div className="detail-backdrop" role="presentation" onMouseDown={() => setSelectedSlot(null)}><section ref={detailRef} tabIndex={-1} className="slot-detail" role="dialog" aria-modal="true" aria-labelledby="slot-title" onMouseDown={(event) => event.stopPropagation()}><button className="detail-close" type="button" onClick={() => setSelectedSlot(null)} aria-label="关闭">×</button><p className="eyebrow">SLOT DETAIL</p><h2 id="slot-title">周{weekdayLabels[selectedSlot.weekday]} · 第 {selectedSlot.period} 节</h2><div className={selectedSlot.slot.commonFree ? "detail-summary free" : "detail-summary"}><strong>{selectedSlot.slot.freeCount} / {selectedSlot.slot.selectedUsers}</strong><span>{selectedSlot.slot.commonFree ? "全部有空" : "人有空"}</span></div><ul>{selectedSlot.slot.details.map((detail) => <li key={detail.userId}><span className={detail.free ? "status-free" : "status-busy"}>{detail.free ? "✓" : "●"}</span><strong>{detail.nickname}</strong><small>{detail.free ? "空闲" : detail.label}</small></li>)}</ul><p className="privacy-hint">私人忙碌标题与“本周不去”状态不会对其他成员公开。</p></section></div>}
    </AppShell>
  );
}
