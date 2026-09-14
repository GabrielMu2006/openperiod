"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { useDialogBehavior } from "@/components/dialog-behavior";
import { PERIOD_TIMES, periodRange, periodRangeMinutes } from "@/src/config/period-times";
import { buildFreeRuns, formatDuration, type FreeRun } from "@/src/domain/free-runs";
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
  semester: { academicYear: string; semester: string; currentWeek: number; weekCount: number; startDate: string; timezone: string };
  members: { id: string; nickname: string; courseCount: number }[];
}

interface GridResponse {
  week: number;
  selectedUsers: number;
  slots: Record<Weekday, Record<string, { commonFree: boolean; freeCount: number; selectedUsers: number }>>;
}

type SelectedSlot = { weekday: Weekday; period: number; slot: AvailabilitySlot };

function Logo() {
  return <span className="logo-mark" aria-hidden="true"><i /><i /></span>;
}

function currentUrlSearchParams() {
  return new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
}

// 以群组时区为准的「现在」：0=周一 … 6=周日 与分钟数
function weekdayIndexNowIn(timezone: string) {
  const label = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" }).format(new Date());
  return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(label);
}

function minutesNowIn(timezone: string) {
  const text = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
  const [hours, minutes] = text.split(":").map(Number);
  return hours * 60 + minutes;
}

// 学期第一周的周一为基准，换算某周某天的日期（按 UTC 计算，避免时区漂移）
function weekdayDate(startDate: string, week: number, weekdayIndex: number) {
  const base = Date.parse(`${startDate}T00:00:00Z`);
  if (Number.isNaN(base)) return null;
  return new Date(base + ((week - 1) * 7 + weekdayIndex) * 86_400_000);
}

function dateLabel(startDate: string, week: number, weekdayIndex: number) {
  const date = weekdayDate(startDate, week, weekdayIndex);
  return date ? `${date.getUTCMonth() + 1}/${date.getUTCDate()}` : "";
}

function longDateLabel(startDate: string, week: number, weekdayIndex: number) {
  const date = weekdayDate(startDate, week, weekdayIndex);
  return date ? `${date.getUTCMonth() + 1}月${date.getUTCDate()}日` : "";
}

// 深绿=全部有空，深红=没人有空，中间按有空比例渐变；两端深、中段浅保证可读
function slotHeatStyle(pct: number) {
  const p = Math.min(1, Math.max(0, pct));
  const hue = Math.round(6 + (145 - 6) * p);
  const edge = Math.abs(p - 0.5) * 2;
  const sat = Math.round(34 + 24 * edge);
  const light = Math.round(88 - 46 * edge);
  return {
    backgroundColor: `hsl(${hue} ${sat}% ${light}%)`,
    color: light < 62 ? "white" : "var(--text-primary)",
    boxShadow: `inset 0 0 0 1px hsl(${hue} ${sat}% ${Math.max(30, light - 16)}%)`,
  };
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch { /* 继续尝试兜底 */ }
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    textarea.remove();
    if (ok) return true;
  } catch { /* 继续尝试兜底 */ }
  // 最后兜底：弹出可全选的输入框，让用户手动复制
  try {
    window.prompt("浏览器未允许自动复制，请全选下面的文字手动复制：", text);
    return true;
  } catch {
    return false;
  }
}

const MIN_MINUTES_OPTIONS = [0, 30, 60, 90, 120];

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
  const [copiedKey, setCopiedKey] = useState("");
  const [viewMode, setViewMode] = useState<"week" | "day">("week");
  const [dayIndex, setDayIndex] = useState<number | null>(null);
  const [swipeHintVisible, setSwipeHintVisible] = useState(true);
  const [membersExpanded, setMembersExpanded] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const gridRef = useRef<HTMLDivElement>(null);
  const [runFilters, setRunFilters] = useState<{ weekdays: Weekday[]; minMinutes: number; daypart: "all" | "day" | "evening" }>({
    weekdays: [...WEEKDAYS], minMinutes: 0, daypart: "all",
  });
  const detailRef = useDialogBehavior(selectedSlot !== null, () => setSelectedSlot(null));

  const activeGroup = useMemo(
    () => groups?.find((group) => group.id === activeGroupId) ?? null,
    [activeGroupId, groups],
  );

  function retry() {
    setGroups(null);
    setGrid(null);
    setError("");
    setReloadKey((key) => key + 1);
  }

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
  }, [router, reloadKey]);

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
        setGrid(null);
        setError(cause instanceof Error ? cause.message : "暂时无法计算共同空闲");
      });
    return () => controller.abort();
  }, [activeGroup, selectedIds, week, reloadKey]);

  // 方向键在矩阵里移动焦点：左右换星期，上下换节次
  function onGridKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    const wdi = target.getAttribute?.("data-wdi");
    const period = target.getAttribute?.("data-period");
    if (!wdi || !period) return;
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    let w = Number(wdi);
    let p = Number(period);
    if (event.key === "ArrowLeft") w = Math.max(0, w - 1);
    if (event.key === "ArrowRight") w = Math.min(WEEKDAYS.length - 1, w + 1);
    if (event.key === "ArrowUp") p = Math.max(1, p - 1);
    if (event.key === "ArrowDown") p = Math.min(12, p + 1);
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-wdi="${w}"][data-period="${p}"]`)?.focus();
  }

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

  async function copyRunText(key: string, text: string) {
    if (await copyText(text)) {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((current) => (current === key ? "" : current)), 2000);
    }
  }

  const noGroups = groups !== null && groups.length === 0 && !error;
  const members = activeGroup?.members ?? [];
  const selectedMembers = members.filter((member) => selectedIds.includes(member.id));
  const unrecordedCount = selectedMembers.filter((member) => member.courseCount === 0).length;
  const isCurrentWeekView = activeGroup !== null && week === activeGroup.semester.currentWeek;
  const todayIndex = activeGroup && isCurrentWeekView ? weekdayIndexNowIn(activeGroup.semester.timezone) : -1;
  const activeDayIdx = dayIndex ?? (todayIndex >= 0 ? todayIndex : 0);
  const nowMinutes = useMemo(
    () => (activeGroup ? minutesNowIn(activeGroup.semester.timezone) : 0),
    [activeGroup, grid],
  );

  const periodIsPast = useMemo(() => {
    if (todayIndex < 0) return () => false;
    const today = WEEKDAYS[todayIndex];
    return (weekday: Weekday, period: number) =>
      weekday === today && (periodRangeMinutes(period, period)?.endMin ?? 0) <= nowMinutes;
  }, [todayIndex, nowMinutes]);

  // 渲染单个格子按钮（周总览与按天视图共用样式与语义）
  function renderSlotButton(weekday: Weekday, weekdayIndex: number, period: number, extraClass = "") {
    const info = grid?.slots[weekday]?.[String(period)];
    const loading = !info;
    const past = periodIsPast(weekday, period);
    const key = `${weekday}-${period}`;
    const pct = info && info.selectedUsers > 0 ? info.freeCount / info.selectedUsers : 0;
    const range = periodRange(period, period);
    const timeText = range ? `${range.start}–${range.end}` : "";
    const stateText = loading
      ? "正在计算"
      : pct === 1
        ? "所有人共同空闲"
        : pct === 0
          ? "没人有空"
          : `${info!.selectedUsers} 人中 ${info!.freeCount} 人有空`;
    const ariaLabel = `周${weekdayLabels[weekday]}${dateLabel(activeGroup!.semester.startDate, week, weekdayIndex)} 第 ${period} 节 ${timeText}，${past ? "已过去，" : ""}${stateText}`;
    return <button
      type="button"
      key={key}
      className={`slot${loading ? " slot-loading" : ""}${past ? " past" : ""}${extraClass}`}
      style={loading ? undefined : slotHeatStyle(pct)}
      data-wdi={weekdayIndex}
      data-period={period}
      aria-label={ariaLabel}
      disabled={loading}
      onClick={() => openDetails(weekday, period)}
    >
      {loading
        ? <span>…</span>
        : pct === 1
          ? <span aria-hidden="true">✓</span>
          : pct === 0
            ? <i aria-hidden="true" className="none-mark" />
            : <span className="partial-count" aria-hidden="true">{info!.freeCount}/{info!.selectedUsers}</span>}
    </button>;
  }

  const freeRuns = useMemo(() => {
    if (!grid) return [];
    return buildFreeRuns(grid.slots, periodIsPast);
  }, [grid, periodIsPast]);

  const visibleRuns = useMemo(() => freeRuns.filter((run) => {
    if (!runFilters.weekdays.includes(run.weekday)) return false;
    const range = periodRangeMinutes(run.startPeriod, run.endPeriod);
    if (!range) return false;
    if (runFilters.daypart === "day" && range.startMin >= 18 * 60) return false;
    if (runFilters.daypart === "evening" && range.startMin < 18 * 60) return false;
    return range.endMin - range.startMin >= runFilters.minMinutes;
  }), [freeRuns, runFilters]);

  function toggleRunWeekday(day: Weekday) {
    setRunFilters((current) => {
      const has = current.weekdays.includes(day);
      const weekdays = has ? current.weekdays.filter((item) => item !== day) : [...current.weekdays, day];
      return { ...current, weekdays: WEEKDAYS.filter((item) => weekdays.includes(item)) };
    });
  }

  const slotDetailRange = selectedSlot ? periodRange(selectedSlot.period, selectedSlot.period) : null;
  const slotDetailWeekdayIndex = selectedSlot ? WEEKDAYS.indexOf(selectedSlot.weekday) : -1;

  return (
    <AppShell
      active="availability"
      topbarCenter={activeGroup && <span className="group-quick">{activeGroup.name}</span>}
      sidebarNote={activeGroup && <div className="semester-note"><span />{activeGroup.semester.academicYear} {activeGroup.semester.semester.replace("学期", "")}<br /><small>第 {week} 周</small></div>}
    >
      <div className="page-heading"><div><p className="eyebrow">COMMON AVAILABILITY</p><h1>共同空闲</h1></div><p>找到所有人都能赴约的课间空档。</p></div>
      {error && <div className="page-error" role="alert">{error}<button type="button" onClick={retry}>重试</button></div>}

      {groups === null ? (
        <section className="workspace loading-panel" aria-label="正在加载"><div className="loading-line" /><div className="loading-line short" /></section>
      ) : noGroups ? (
        <section className="workspace empty-state"><Logo /><h2>还没有群组</h2><p>创建一个群组，或者输入朋友发来的邀请码。</p><div className="empty-actions"><a className="primary-action" href="/groups/new">创建群组</a><a href="/join">加入群组</a></div></section>
      ) : activeGroup ? (
        <section className="workspace" aria-label="共同空闲课表">
          <div className="controls">
            <label className="group-control"><span>群组</span><select value={activeGroup.id} onChange={(event) => changeGroup(event.target.value)}>{groups.map((group) => <option value={group.id} key={group.id}>{group.name} · {group.members.length} 人</option>)}</select></label>
            <div className="week-control" aria-label="教学周"><span>教学周</span><div>
              <button type="button" disabled={week === 1} onClick={() => setWeek((value) => Math.max(1, value - 1))} aria-label="上一周">‹</button>
              <select className="week-select" value={week} onChange={(event) => setWeek(Number(event.target.value))} aria-label="选择教学周">
                {Array.from({ length: activeGroup.semester.weekCount }, (_, index) => index + 1).map((value) => (
                  <option value={value} key={value}>第 {value} 周{value === activeGroup.semester.currentWeek ? "（本周）" : ""}</option>
                ))}
              </select>
              <button type="button" disabled={week === activeGroup.semester.weekCount} onClick={() => setWeek((value) => Math.min(activeGroup.semester.weekCount, value + 1))} aria-label="下一周">›</button>
              {week !== activeGroup.semester.currentWeek && <button type="button" className="back-to-now" onClick={() => setWeek(activeGroup.semester.currentWeek)}>回到本周</button>}
            </div></div>
            <div className="mode-control" role="group" aria-label="查看模式"><span>模式</span><div className="mode-toggle">
              <button type="button" className={viewMode === "week" ? "on" : ""} aria-pressed={viewMode === "week"} onClick={() => setViewMode("week")}>周总览</button>
              <button type="button" className={viewMode === "day" ? "on" : ""} aria-pressed={viewMode === "day"} onClick={() => setViewMode("day")}>按天</button>
            </div></div>
          </div>

          <div className="member-bar"><div><strong>参与成员</strong><span>已选择 {selectedIds.length} / {members.length} 人</span></div><div className="member-chips"><button type="button" className={selectedIds.length === members.length ? "selected" : ""} onClick={() => setSelectedIds(selectedIds.length === members.length ? [] : members.map((member) => member.id))}>{selectedIds.length === members.length ? "取消全选" : "全选"}</button>{(members.length > 6 && !membersExpanded ? members.slice(0, 5) : members).map((member) => { const selected = selectedIds.includes(member.id); return <button type="button" className={selected ? "selected" : ""} aria-pressed={selected} title={member.courseCount === 0 ? "该成员尚未录入课表，按全天空闲计算" : undefined} onClick={() => toggleMember(member.id)} key={member.id}>{selected && <span>✓</span>}{member.nickname}{member.courseCount === 0 && <em className="chip-flag">未录</em>}</button>; })}{members.length > 6 && <button type="button" className="members-toggle" aria-expanded={membersExpanded} onClick={() => setMembersExpanded((value) => !value)}>{membersExpanded ? "收起" : `全部 ${members.length} 人`}</button>}</div></div>

          {selectedIds.length === 0 ? <div className="empty-state"><Logo /><h2>请选择至少一位成员</h2><p>选择成员后，这里会立即显示共同空闲。</p></div> : (
            <div className="timetable-wrap">
              <div className="legend"><span><i className="grad grad-all" />全部有空</span><span><i className="grad grad-some" />部分有空</span><span><i className="grad grad-none" />没人有空</span><small>颜色越绿代表有空的人越多 · 点击格子查看成员状态</small></div>
              {viewMode === "week" ? (
                <div className="grid-scroller" onScroll={(event) => { if (swipeHintVisible && event.currentTarget.scrollLeft > 12) setSwipeHintVisible(false); }}>
                  <div className="timetable-grid" ref={gridRef} onKeyDown={onGridKeyDown}>
                    <div className="corner">节次</div>
                    {WEEKDAYS.map((day, index) => (
                      <div className={`day-heading${index === todayIndex ? " today" : ""}`} key={day}>
                        <strong>周{weekdayLabels[day]}</strong>
                        <small>{dateLabel(activeGroup.semester.startDate, week, index)}{index === todayIndex && " · 今天"}</small>
                      </div>
                    ))}
                    {Array.from({ length: 12 }, (_, index) => index + 1).flatMap((period) => [
                      <div className="period" key={`period-${period}`}><strong>{period}</strong><small className="period-time">{PERIOD_TIMES[period - 1]?.start}</small></div>,
                      ...WEEKDAYS.map((weekday, weekdayIndex) => renderSlotButton(weekday, weekdayIndex, period)),
                    ])}
                  </div>
                  <span className={`swipe-hint${swipeHintVisible ? "" : " gone"}`} aria-hidden="true">← 表格可左右滑动 →</span>
                </div>
              ) : (
                <div className="day-view">
                  <div className="day-chips" role="group" aria-label="选择星期">
                    {WEEKDAYS.map((day, index) => (
                      <button type="button" key={day} className={index === activeDayIdx ? "on" : ""} aria-pressed={index === activeDayIdx} onClick={() => setDayIndex(index)}>
                        周{weekdayLabels[day]}<small>{dateLabel(activeGroup.semester.startDate, week, index)}{index === todayIndex && " · 今天"}</small>
                      </button>
                    ))}
                  </div>
                  <ul className="day-slots">
                    {Array.from({ length: 12 }, (_, index) => index + 1).map((period) => {
                      const weekday = WEEKDAYS[activeDayIdx];
                      const range = periodRange(period, period);
                      return <li key={period}>
                        <div className="day-slot-time"><strong>第 {period} 节</strong><small>{range ? `${range.start}–${range.end}` : ""}</small></div>
                        {renderSlotButton(weekday, activeDayIdx, period, " day-slot")}
                      </li>;
                    })}
                  </ul>
                </div>
              )}
              {grid && unrecordedCount > 0 && <p className="completeness-note">注意：{unrecordedCount} 位所选成员尚未录入课表，TA 们按全天空闲计算，结果可能偏乐观。</p>}
            </div>
          )}

          {grid && selectedIds.length > 0 && (
            <section className="free-runs" aria-label="连续共同空档">
              <div className="free-runs-head">
                <strong>连续空档</strong><span>{visibleRuns.length} 段</span>
                <div className="free-runs-filters">
                  <div className="run-day-chips" role="group" aria-label="按星期筛选">
                    {WEEKDAYS.map((day) => {
                      const on = runFilters.weekdays.includes(day);
                      return <button type="button" key={day} className={on ? "on" : ""} aria-pressed={on} onClick={() => toggleRunWeekday(day)}>周{weekdayLabels[day]}</button>;
                    })}
                  </div>
                  <select value={runFilters.minMinutes} aria-label="最短时长" onChange={(event) => setRunFilters((current) => ({ ...current, minMinutes: Number(event.target.value) }))}>
                    {MIN_MINUTES_OPTIONS.map((minutes) => <option value={minutes} key={minutes}>{minutes === 0 ? "任意时长" : `≥ ${minutes} 分钟`}</option>)}
                  </select>
                  <select value={runFilters.daypart} aria-label="白天或晚间" onChange={(event) => setRunFilters((current) => ({ ...current, daypart: event.target.value as "all" | "day" | "evening" }))}>
                    <option value="all">全天</option>
                    <option value="day">白天（18 点前开始）</option>
                    <option value="evening">晚间（18 点后开始）</option>
                  </select>
                </div>
              </div>
              {visibleRuns.length === 0 ? (
                <p className="runs-empty">这一周没有符合筛选条件的共同空档。</p>
              ) : (
                <ul className="free-run-list">
                  {visibleRuns.map((run) => {
                    const weekdayIndex = WEEKDAYS.indexOf(run.weekday);
                    const range = periodRange(run.startPeriod, run.endPeriod);
                    const minutes = range ? periodRangeMinutes(run.startPeriod, run.endPeriod)! : null;
                    const runKey = `${run.weekday}-${run.startPeriod}`;
                    const copyLabel = `${longDateLabel(activeGroup.semester.startDate, week, weekdayIndex)}（周${weekdayLabels[run.weekday]}）${range ? `${range.start}–${range.end}` : ""} 大家都有空 · 来自课隙 OpenPeriod`;
                    return <li key={runKey}>
                      <strong>{dateLabel(activeGroup.semester.startDate, week, weekdayIndex)}（周{weekdayLabels[run.weekday]}）</strong>
                      <span>{range ? `${range.start}–${range.end}` : ""}</span>
                      <small>第 {run.startPeriod}–{run.endPeriod} 节</small>
                      <em>{minutes ? formatDuration(minutes.endMin - minutes.startMin) : ""}</em>
                      <button type="button" className="run-copy" onClick={() => copyRunText(runKey, copyLabel)}>{copiedKey === runKey ? "已复制 ✓" : "复制"}</button>
                    </li>;
                  })}
                </ul>
              )}
            </section>
          )}
        </section>
      ) : null}

      {selectedSlot && <div className="detail-backdrop" role="presentation" onMouseDown={() => setSelectedSlot(null)}><section ref={detailRef} tabIndex={-1} className="slot-detail" role="dialog" aria-modal="true" aria-labelledby="slot-title" onMouseDown={(event) => event.stopPropagation()}><button className="detail-close" type="button" onClick={() => setSelectedSlot(null)} aria-label="关闭">×</button><p className="eyebrow">SLOT DETAIL</p><h2 id="slot-title">周{weekdayLabels[selectedSlot.weekday]} · 第 {selectedSlot.period} 节</h2>{slotDetailRange && activeGroup && <p className="detail-meta">{longDateLabel(activeGroup.semester.startDate, week, slotDetailWeekdayIndex)}（周{weekdayLabels[selectedSlot.weekday]}）{slotDetailRange.start}–{slotDetailRange.end}</p>}<div className={selectedSlot.slot.commonFree ? "detail-summary free" : "detail-summary"}><strong>{selectedSlot.slot.freeCount} / {selectedSlot.slot.selectedUsers}</strong><span>{selectedSlot.slot.commonFree ? "全部有空" : "人有空"}</span></div>{unrecordedCount > 0 && <p className="detail-note">注意：{unrecordedCount} 位所选成员尚未录入课表，TA 们按全天空闲计算。</p>}<ul>{selectedSlot.slot.details.map((detail) => <li key={detail.userId}><span className={detail.free ? "status-free" : "status-busy"}>{detail.free ? "✓" : "●"}</span><strong>{detail.nickname}</strong><small>{detail.free ? "空闲" : detail.label}</small></li>)}</ul><div className="detail-actions"><button type="button" className="copy-time" onClick={() => copyRunText(`detail-${selectedSlot.weekday}-${selectedSlot.period}`, `${longDateLabel(activeGroup!.semester.startDate, week, slotDetailWeekdayIndex)}（周${weekdayLabels[selectedSlot.weekday]}）${slotDetailRange ? `${slotDetailRange.start}–${slotDetailRange.end}` : ""}，${selectedSlot.slot.freeCount}/${selectedSlot.slot.selectedUsers} 人有空 · 来自课隙 OpenPeriod`)}>{copiedKey === `detail-${selectedSlot.weekday}-${selectedSlot.period}` ? "已复制 ✓" : "复制时间信息"}</button></div><p className="privacy-hint">私人忙碌标题与“本周不去”状态不会对其他成员公开。</p></section></div>}
    </AppShell>
  );
}
