"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowsHorizontal, CaretLeft, CaretRight, Plus, X } from "@phosphor-icons/react";
import { AppShell } from "@/components/app-shell";
import { useDialogBehavior } from "@/components/dialog-behavior";
import { LoadingState } from "@/components/loading-state";
import { WEEKDAYS, type Weekday } from "@/src/domain/schedule";
import { buildEndOptions, buildPeriodOptions, getScheduleForSemester, schedulePeriodCount } from "@/src/config/school-schedules";
import { ThemedSelect } from "@/components/themed-select";
import { localId } from "@/src/config/local-id";
import { PeriodFields, periodModeTabs, type PeriodMode } from "@/components/period-mode-fields";
import { parseWeekRule } from "@/src/domain/week-rules";

const dayLabels: Record<Weekday, string> = {
  monday: "一", tuesday: "二", wednesday: "三", thursday: "四",
  friday: "五", saturday: "六", sunday: "日",
};

const weekdayOptions = WEEKDAYS.map((day) => ({ value: day, label: `周${dayLabels[day]}` }));

interface MeetingDTO {
  id: string;
  weekday: Weekday;
  startPeriod: number;
  endPeriod: number;
  weeks: number[];
  skippedThisWeek: boolean;
  skippedWeeks: number[];
}

interface CourseDTO {
  id: string;
  name: string;
  instructor: string;
  location: string;
  meetings: MeetingDTO[];
}

interface BusyDTO {
  id: string;
  kind: "ONE_TIME" | "RECURRING";
  title: string;
  weekday: Weekday;
  startPeriod: number;
  endPeriod: number;
  weeks: number[];
}

interface ScheduleDTO {
  week: number;
  confirmedEmpty: boolean;
  semester: { academicYear: string; semester: string; currentWeek: number; weekCount: number; startDate: string; timezone?: string; scheduleId?: string | null; schedule?: { id: string; school: string; kind: "period" | "block"; rows: { start: string; end: string; label?: string }[]; blocks?: { label: string; from: number; to: number }[] } };
  courses: CourseDTO[];
  busyBlocks: BusyDTO[];
}

type CourseSelection = { type: "course"; course?: CourseDTO; meetingId?: string };
type BusySelection = { type: "busy"; block?: BusyDTO; prefill?: { weekday: Weekday; startPeriod: number; endPeriod: number } };
type Selection = CourseSelection | BusySelection | null;
type Notice = { text: string; undo?: () => Promise<void> } | null;

function weeksText(weeks: number[], weekCount = 16) {
  const value = weeks.join(",");
  const allWeeks = Array.from({ length: weekCount }, (_, i) => i + 1);
  if (value === allWeeks.join(",")) return `1-${weekCount}`;
  if (value === allWeeks.filter((week) => week % 2 === 1).join(",")) return "单周";
  if (value === allWeeks.filter((week) => week % 2 === 0).join(",")) return "双周";
  return value;
}

function weeksDescription(weeks: number[]) {
  if (!weeks.length) return "无";
  if (weeks.length === 1) return `第 ${weeks[0]} 周`;
  const consecutive = weeks.every((week, index) => index === 0 || week === weeks[index - 1] + 1);
  return consecutive ? `第 ${weeks[0]}–${weeks[weeks.length - 1]} 周` : `第 ${weeks.join("、")} 周`;
}

function weekdayDateLabel(startDate: string, week: number, weekdayIndex: number) {
  const base = Date.parse(`${startDate}T00:00:00Z`);
  if (Number.isNaN(base)) return "";
  const date = new Date(base + ((week - 1) * 7 + weekdayIndex) * 86_400_000);
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
}

function weekdayIndexNowIn(timezone: string) {
  const label = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" }).format(new Date());
  return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(label);
}

function scheduleRangeText(rows: { start: string; end: string }[], startPeriod: number, endPeriod: number) {
  const start = rows[startPeriod - 1]?.start;
  const end = rows[endPeriod - 1]?.end;
  return start && end ? `${start}–${end}` : `第 ${startPeriod}–${endPeriod} 节`;
}

// 在现有周次文本里翻转某一周，返回新的周次文本
function toggleWeekInText(currentText: string, week: number, weekCount: number) {
  const parsed = parseWeekRule(currentText, weekCount);
  const set = new Set(parsed.recognized ? parsed.weeks : Array.from({ length: weekCount }, (_, i) => i + 1));
  if (set.has(week)) set.delete(week);
  else set.add(week);
  return [...set].sort((a, b) => a - b).join(",");
}

async function mutation(url: string, method: string, body?: unknown) {
  const response = await fetch(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = response.status === 204 ? {} : await response.json() as { error?: string };
  if (!response.ok) throw new Error(result.error ?? "操作失败");
  return result;
}

export function MySchedule() {
  const router = useRouter();
  const [schedule, setSchedule] = useState<ScheduleDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [week, setWeek] = useState<number | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const [snapshotId, setSnapshotId] = useState("");
  const [restoring, setRestoring] = useState(false);
  const [swipeHintVisible, setSwipeHintVisible] = useState(true);
  const [retryKey, setRetryKey] = useState(0);
  const [viewMode, setViewMode] = useState<"week" | "day">("week");
  const [dayIndex, setDayIndex] = useState<number | null>(null);
  const loadRequestRef = useRef(0);
  const mySchedule = schedule?.semester.schedule ?? getScheduleForSemester(schedule?.semester);
  const [infoOpen, setInfoOpen] = useState(false);
  const [showInfoBanner, setShowInfoBanner] = useState(false);
  const infoRef = useDialogBehavior(infoOpen, () => setInfoOpen(false), false);
  const scheduleKey = schedule ? (schedule.semester.schedule?.id ?? schedule.semester.scheduleId ?? "pku") : "pku";
  // 账号层面的学校设置：null = 从未设置；"custom" = 自定义作息（可能还没走完向导）
  const [userScheduleId, setUserScheduleId] = useState<string | null>(null);
  const [firstSchoolCardDismissed, setFirstSchoolCardDismissed] = useState(true);
  const [customCardDismissed, setCustomCardDismissed] = useState(false);
  const customNeedsSetup = Boolean(schedule && userScheduleId === "custom" && mySchedule.school.includes("未设置作息"));

  // 和共同空闲保持一致：桌面默认周总览，手机默认按天。
  useEffect(() => {
    if (window.innerWidth <= 639) setViewMode("day");
  }, []);

  // 首次进入或更换学校后，提醒核对节次时间
  useEffect(() => {
    if (!schedule) return;
    setShowInfoBanner(localStorage.getItem("op-schedule-info-seen") !== scheduleKey);
  }, [schedule, scheduleKey]);

  function openScheduleInfo() {
    setInfoOpen(true);
    localStorage.setItem("op-schedule-info-seen", scheduleKey);
    setShowInfoBanner(false);
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("imported")) {
      setNotice({ text: "课表导入成功，已替换当前学期的课表。" });
      setSnapshotId(params.get("snapshot") ?? "");
      window.history.replaceState(null, "", "/schedule");
    } else if (params.has("custom")) {
      setNotice({ text: "作息时间表已保存。点「添加课程」逐门录入，时间直接写开始与结束即可。" });
      window.history.replaceState(null, "", "/schedule");
    }
  }, []);

  // 提示条 12 秒后自动消失（撤销按钮也随之收起）
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 12_000);
    return () => clearTimeout(timer);
  }, [notice]);

  const load = useCallback(async (signal?: AbortSignal) => {
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    try {
      // 教学周优先从链接恢复（?week=N），链接里没有才用服务器的当前周
      const params = new URLSearchParams(window.location.search);
      const urlWeek = Number(params.get("week"));
      const targetWeek = week ?? (Number.isInteger(urlWeek) && urlWeek >= 1 && urlWeek <= 52 ? urlWeek : null);
      const response = await fetch(`/api/schedule${targetWeek === null ? "" : `?week=${targetWeek}`}`, { signal });
      if (response.status === 401) return router.replace("/login");
      const body = await response.json() as { schedule?: ScheduleDTO; userScheduleId?: string | null; error?: string };
      if (!response.ok || !body.schedule) throw new Error(body.error ?? "无法读取个人课表");
      if (requestId !== loadRequestRef.current) return;
      setSchedule(body.schedule);
      setUserScheduleId(body.userScheduleId ?? null);
      setFirstSchoolCardDismissed(localStorage.getItem("op-first-school-card") === "1");
      setWeek((current) => current ?? targetWeek ?? body.schedule!.week);
    } finally {
      if (requestId === loadRequestRef.current) setLoading(false);
    }
  }, [router, week, retryKey]);

  useEffect(() => {
    const controller = new AbortController();
    setError("");
    load(controller.signal).catch((cause) => {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setError(cause instanceof Error ? cause.message : "无法读取个人课表");
    });
    return () => controller.abort();
  }, [load]);

  // 当前教学周写入链接，往返后保留
  useEffect(() => {
    if (week === null) return;
    const params = new URLSearchParams(window.location.search);
    params.set("week", String(week));
    window.history.replaceState(null, "", `/schedule?${params.toString()}`);
  }, [week]);

  const visibleCourses = useMemo(() => schedule?.courses.flatMap((course) => course.meetings
    .filter((meeting) => meeting.weeks.includes(schedule.week))
    .map((meeting) => ({ course, meeting }))) ?? [], [schedule]);
  const visibleBusy = useMemo(() => schedule?.busyBlocks.filter((block) => block.weeks.includes(schedule.week)) ?? [], [schedule]);
  const hasScheduleEntries = Boolean(schedule && (schedule.courses.length > 0 || schedule.busyBlocks.length > 0));
  const todayIndex = schedule && week === schedule.semester.currentWeek
    ? weekdayIndexNowIn(schedule.semester.timezone ?? "Asia/Shanghai")
    : -1;
  const activeDayIdx = dayIndex ?? (todayIndex >= 0 ? todayIndex : 0);
  const activeDay = WEEKDAYS[activeDayIdx];

  // 当前周已被课程/忙碌占用的格子：这些格子不可再点出「标记忙碌」
  const occupiedSlots = useMemo(() => {
    const set = new Set<string>();
    for (const { meeting } of visibleCourses)
      for (let period = meeting.startPeriod; period <= meeting.endPeriod; period += 1) set.add(`${WEEKDAYS.indexOf(meeting.weekday)}:${period}`);
    for (const block of visibleBusy)
      for (let period = block.startPeriod; period <= block.endPeriod; period += 1) set.add(`${WEEKDAYS.indexOf(block.weekday)}:${period}`);
    return set;
  }, [visibleCourses, visibleBusy]);

  // 手机上表格横向滑动后 250ms 内的点击视为滑动余波，忽略，避免误开弹窗
  const lastScrollAtRef = useRef(0);

  function markBusyFromCell(weekdayIndex: number, period: number) {
    if (Date.now() - lastScrollAtRef.current < 250) return;
    setSelection({ type: "busy", prefill: { weekday: WEEKDAYS[weekdayIndex], startPeriod: period, endPeriod: period + 1 } });
  }

  async function refreshAndClose() {
    await load();
    setSelection(null);
  }

  function handleSkipChange(meeting: MeetingDTO, skipWeek: number, skipped: boolean) {
    if (!schedule) return;
    const date = weekdayDateLabel(schedule.semester.startDate, skipWeek, WEEKDAYS.indexOf(meeting.weekday));
    setNotice({
      text: `${skipped ? "已标记" : "已恢复"} ${date}（周${dayLabels[meeting.weekday]} 第${meeting.startPeriod}–${meeting.endPeriod}节）`,
      undo: async () => {
        await mutation(`/api/course-meetings/${meeting.id}/skip`, "PUT", { week: skipWeek, skipped: !skipped });
        setNotice(null);
        await load();
      },
    });
  }

  function handleBatchSkip(meeting: MeetingDTO, weeks: number[], previousWeeks: number[]) {
    setNotice({
      text: weeks.length ? `已批量标记不去：${weeksDescription(weeks)}` : "已清除该时段的全部「不去」标记",
      undo: async () => {
        await mutation(`/api/course-meetings/${meeting.id}/skip`, "PUT", { weeks: previousWeeks });
        setNotice(null);
        await load();
      },
    });
  }

  async function restoreSnapshot() {
    if (!snapshotId || restoring) return;
    setRestoring(true);
    setError("");
    try {
      const response = await fetch("/api/import/restore", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ snapshotId }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "恢复失败");
      setNotice({ text: "已恢复导入前的课表。" });
      setSnapshotId("");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "恢复失败");
    } finally {
      setRestoring(false);
    }
  }

  // 显式确认/取消「本学期无课」：群组共同空闲据此区分「未知课表」与「无课（有空）」
  async function setConfirmedEmpty(confirmed: boolean) {
    setError("");
    try {
      await mutation("/api/schedule/confirm-empty", "PUT", { confirmed });
      setNotice({ text: confirmed ? "已确认本学期无课。" : "已取消「本学期无课」确认。" });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "操作失败");
    }
  }

  return (
    <AppShell active="schedule">
      <div className="schedule-page">
        <div className="schedule-heading"><div><p className="eyebrow">MY SCHEDULE</p><h1>我的课表</h1><p>{schedule ? `${schedule.semester.academicYear} ${schedule.semester.semester}` : "管理课程和私人忙碌时间"}</p></div><div className="schedule-heading-actions"><button type="button" disabled={!schedule || loading} onClick={() => openScheduleInfo()}>查看课表信息</button><a href="/import">导入 Excel</a><button type="button" disabled={!schedule || loading} onClick={() => setSelection({ type: "course" })}><Plus className="ui-icon" weight="bold" />添加课程</button><button className="busy-action" type="button" disabled={!schedule || loading} onClick={() => setSelection({ type: "busy" })}><Plus className="ui-icon" weight="bold" />标记忙碌</button></div></div>
        {error && <div className="page-error" role="alert">{error}<button type="button" onClick={() => { setError(""); setRetryKey((key) => key + 1); }}>重试</button></div>}
        {showInfoBanner && schedule && <div className="schedule-info-banner" role="status"><span>你的课表按「{schedule.semester.schedule?.school ?? "北京大学"}」作息显示，建议核对节次与时间是否正确。</span><span className="banner-actions"><button type="button" onClick={() => openScheduleInfo()}>查看课表信息</button><button type="button" className="link-button" onClick={() => { localStorage.setItem("op-schedule-info-seen", scheduleKey); setShowInfoBanner(false); }}>我知道了</button></span></div>}
        {!loading && schedule && userScheduleId === null && !firstSchoolCardDismissed && <div className="school-guide-card" role="note">
          <div><strong>还没选择你的学校？</strong><span>选择学校后，课表会按贵校作息显示；不在列表里也可以自定义作息、照常导入课表（推荐电脑操作）。</span></div>
          <span className="banner-actions"><a className="primary-action" href="/custom-school?return=/schedule">自定义学校作息</a><a href="/settings">去选择学校</a><button type="button" className="link-button" onClick={() => { localStorage.setItem("op-first-school-card", "1"); setFirstSchoolCardDismissed(true); }}>我知道了</button></span>
        </div>}
        {!loading && customNeedsSetup && !customCardDismissed && <div className="school-guide-card" role="note">
          <div><strong>完成你的自定义学校设置</strong><span>还差一步：填好每节课的起止时间和学校名称并提交，之后就能导入课表（推荐电脑操作）。</span></div>
          <span className="banner-actions"><a className="primary-action" href="/custom-school?return=/schedule">继续设置</a><button type="button" className="link-button" onClick={() => setCustomCardDismissed(true)}>暂不设置</button></span>
        </div>}
        {notice && <div className="page-success" role="status">{notice.text}{notice.undo && <button type="button" className="link-button" onClick={notice.undo}>撤销</button>}{snapshotId && <button type="button" className="link-button" disabled={restoring} onClick={restoreSnapshot}>{restoring ? "恢复中…" : "恢复导入前的课表"}</button>}</div>}
        {schedule && week !== null ? <div className={`schedule-results${loading ? " is-updating" : ""}`} aria-busy={loading}>
          {loading && <div className="update-status" role="status" aria-live="polite" aria-atomic="true"><span className="update-status-track" aria-hidden="true"><i /></span>正在更新第 {week} 周课表…</div>}
          <div className="my-schedule-toolbar">
            <div className="my-week-switcher"><button type="button" className="icon-button" aria-label="上一周" disabled={week <= 1} onClick={() => setWeek((value) => Math.max(1, (value ?? 1) - 1))}><CaretLeft className="ui-icon" weight="bold" /></button><strong>第 {week} 周 {week === schedule.semester.currentWeek && <em>本周</em>}</strong><button type="button" className="icon-button" aria-label="下一周" disabled={week >= schedule.semester.weekCount} onClick={() => setWeek((value) => Math.min(schedule.semester.weekCount, (value ?? 1) + 1))}><CaretRight className="ui-icon" weight="bold" /></button></div>
            {hasScheduleEntries && <div className="mode-control my-view-control" role="group" aria-label="课表查看模式"><span>查看方式</span><div className="mode-toggle">
              <button type="button" className={viewMode === "week" ? "on" : ""} aria-pressed={viewMode === "week"} onClick={() => setViewMode("week")}>周总览</button>
              <button type="button" className={viewMode === "day" ? "on" : ""} aria-pressed={viewMode === "day"} onClick={() => setViewMode("day")}>按天</button>
            </div></div>}
          </div>
          {!hasScheduleEntries ? <section className="my-schedule-empty"><span className="logo-mark"><i /><i /></span><h2>你还没有课表</h2><p>上传 Excel，手动添加第一门课程，或先自定义学校作息。</p><div><a href="/import">上传 Excel</a><button type="button" onClick={() => setSelection({ type: "course" })}>手动添加</button><a href="/custom-school?return=/schedule">其他学校？自定义作息</a></div>{schedule.confirmedEmpty ? <p className="confirmed-empty-note">已确认本学期无课：群组共同空闲会按你「无课（有空）」参与。<button type="button" className="link-button" onClick={() => setConfirmedEmpty(false)}>取消确认</button></p> : <p className="confirmed-empty-note">本学期真的没有课？<button type="button" className="link-button" onClick={() => setConfirmedEmpty(true)}>确认无课</button>，否则群组里你的状态会显示「待确认」。</p>}</section> : <>
            <p className="my-grid-hint">点空白时段可快速标记「忙碌」，点课程或忙碌块可查看详情。</p>
            {viewMode === "week" ? (
              <div className="my-grid-scroller" onScroll={(event) => { lastScrollAtRef.current = Date.now(); if (swipeHintVisible && event.currentTarget.scrollLeft > 12) setSwipeHintVisible(false); }}><div className="my-timetable">
                <div className="my-corner">节次</div>{WEEKDAYS.map((day, index) => <div className="my-day" style={{ gridColumn: index + 2 }} key={day}>周{dayLabels[day]}<small>{weekdayDateLabel(schedule.semester.startDate, week, index)}</small></div>)}
                {Array.from({ length: schedulePeriodCount(mySchedule) }, (_, index) => index + 1).map((period) => <div className="my-period" style={{ gridRow: period + 1 }} key={period}><strong>{period}</strong><small>{mySchedule.rows[period - 1]?.label ?? `第 ${period} 节`}</small></div>)}
                {Array.from({ length: schedulePeriodCount(mySchedule) * 7 }, (_, index) => {
                  const weekdayIndex = index % 7;
                  const period = Math.floor(index / 7) + 1;
                  const occupied = occupiedSlots.has(`${weekdayIndex}:${period}`);
                  return <button type="button" className="my-grid-cell" style={{ gridColumn: weekdayIndex + 2, gridRow: period + 1 }} key={index} disabled={occupied} aria-label={occupied ? undefined : `周${dayLabels[WEEKDAYS[weekdayIndex]]} 第${period}节，标记忙碌`} onClick={() => markBusyFromCell(weekdayIndex, period)} />;
                })}
                {visibleCourses.map(({ course, meeting }) => <button type="button" className={`my-course-block ${meeting.skippedThisWeek ? "skipped" : ""}`} style={{ gridColumn: WEEKDAYS.indexOf(meeting.weekday) + 2, gridRow: `${meeting.startPeriod + 1} / ${meeting.endPeriod + 2}` }} onClick={() => setSelection({ type: "course", course, meetingId: meeting.id })} key={meeting.id}><strong>{course.name}</strong><span>{course.location || `${meeting.startPeriod}–${meeting.endPeriod} 节`}</span>{meeting.skippedThisWeek && <em>本周不去</em>}</button>)}
                {visibleBusy.map((block) => <button type="button" className="my-busy-block" style={{ gridColumn: WEEKDAYS.indexOf(block.weekday) + 2, gridRow: `${block.startPeriod + 1} / ${block.endPeriod + 2}` }} onClick={() => setSelection({ type: "busy", block })} key={block.id}><strong>{block.title || "忙碌"}</strong><span>{block.kind === "ONE_TIME" ? `仅第 ${block.weeks.join(",")} 周` : "周期"}</span></button>)}
              </div><span className={`swipe-hint${swipeHintVisible ? "" : " gone"}`} aria-hidden="true"><ArrowsHorizontal className="ui-icon" weight="bold" />表格可左右滑动</span></div>
            ) : (
              <div className="my-day-view">
                <div className="day-chips" role="group" aria-label="选择星期">
                  {WEEKDAYS.map((day, index) => <button type="button" key={day} className={index === activeDayIdx ? "on" : ""} aria-pressed={index === activeDayIdx} onClick={() => setDayIndex(index)}>周{dayLabels[day]}<small>{weekdayDateLabel(schedule.semester.startDate, week, index)}{index === todayIndex && " · 今天"}</small></button>)}
                </div>
                <div className="my-day-timetable" aria-label={`周${dayLabels[activeDay]}课表`} style={{ gridTemplateRows: `repeat(${schedulePeriodCount(mySchedule)}, 64px)` }}>
                  {Array.from({ length: schedulePeriodCount(mySchedule) }, (_, index) => index + 1).map((period) => {
                    const row = mySchedule.rows[period - 1];
                    const occupied = occupiedSlots.has(`${activeDayIdx}:${period}`);
                    return <div className="my-day-row" style={{ gridRow: period }} key={period}>
                      <div className="my-day-period"><strong>{row?.start ?? `第 ${period} 节`}</strong><small>{row?.end ?? row?.label ?? ""}</small></div>
                      <button type="button" className="my-day-cell" disabled={occupied} aria-label={occupied ? undefined : `周${dayLabels[activeDay]} ${row ? `${row.start}–${row.end}` : `第${period}节`}，标记忙碌`} onClick={() => markBusyFromCell(activeDayIdx, period)} />
                    </div>;
                  })}
                  {visibleCourses.filter(({ meeting }) => meeting.weekday === activeDay).map(({ course, meeting }) => {
                    const range = scheduleRangeText(mySchedule.rows, meeting.startPeriod, meeting.endPeriod);
                    return <button type="button" className={`my-course-block my-day-event ${meeting.skippedThisWeek ? "skipped" : ""}`} style={{ gridRow: `${meeting.startPeriod} / ${meeting.endPeriod + 1}` }} aria-label={`${course.name}，${range}，查看详情`} onClick={() => setSelection({ type: "course", course, meetingId: meeting.id })} key={meeting.id}><strong>{course.name}</strong><span>{range}{course.location ? ` · ${course.location}` : ""}</span>{meeting.skippedThisWeek && <em>本周不去</em>}</button>;
                  })}
                  {visibleBusy.filter((block) => block.weekday === activeDay).map((block) => {
                    const range = scheduleRangeText(mySchedule.rows, block.startPeriod, block.endPeriod);
                    return <button type="button" className="my-busy-block my-day-event" style={{ gridRow: `${block.startPeriod} / ${block.endPeriod + 1}` }} aria-label={`${block.title || "忙碌"}，${range}，查看详情`} onClick={() => setSelection({ type: "busy", block })} key={block.id}><strong>{block.title || "忙碌"}</strong><span>{range} · {block.kind === "ONE_TIME" ? `仅第 ${block.weeks.join(",")} 周` : "周期"}</span></button>;
                  })}
                </div>
              </div>
            )}
          </>}
          {infoOpen && mySchedule && <div className="detail-backdrop" role="presentation" onMouseDown={() => setInfoOpen(false)}><section ref={infoRef} tabIndex={-1} className="schedule-editor info-editor" role="dialog" aria-modal="true" aria-labelledby="schedule-info-title" onMouseDown={(event) => event.stopPropagation()}><header><div><p className="eyebrow">SCHEDULE INFO</p><h2 id="schedule-info-title">{mySchedule.school}作息（{mySchedule.rows.length} 节）</h2></div><button type="button" className="icon-button" aria-label="关闭" onClick={() => setInfoOpen(false)}><X className="ui-icon" weight="bold" /></button></header><div className="editor-body"><table className="info-period-table"><thead><tr><th>节次</th><th>时间</th></tr></thead><tbody>{mySchedule.rows.map((row, index) => <tr key={index}><td>{row.label ?? "第 " + (index + 1) + " 节"}</td><td>{row.start} – {row.end}</td></tr>)}</tbody></table><p className="admin-note">手动添加课程/忙碌时，这里的节次号与上表一一对应。如果时间与你们学校的实际作息不符，请告诉我们。</p><div className="feedback-meta"><button type="button" onClick={() => { window.dispatchEvent(new CustomEvent("op:open-feedback")); setInfoOpen(false); }}>有问题，去反馈</button><button type="button" className="link-button" onClick={() => setInfoOpen(false)}>关闭</button></div></div></section></div>}
      <div className="my-schedule-legend"><span><i className="course" />课程</span><span><i className="busy" />私人忙碌</span><span><i className="skipped" />本周不去</span><small>私人忙碌标题与 Skip 状态不会对其他成员公开。</small></div>
        </div> : !error && <div className="preview-loading"><LoadingState label="正在读取个人课表…" /></div>}
      </div>
      {selection?.type === "course" && schedule && <CourseEditor selection={selection} week={schedule.week} semesterWeekCount={schedule.semester.weekCount} semesterStartDate={schedule.semester.startDate} scheduleInfo={schedule.semester.schedule} busyBlocks={schedule.busyBlocks} onClose={() => setSelection(null)} onSaved={refreshAndClose} onError={setError} onSkipChange={handleSkipChange} onBatchSkip={handleBatchSkip} />}
      {selection?.type === "busy" && schedule && <BusyEditor selection={selection} week={schedule.week} semesterWeekCount={schedule.semester.weekCount} scheduleInfo={schedule.semester.schedule} courses={schedule.courses} onClose={() => setSelection(null)} onSaved={refreshAndClose} onError={setError} />}
    </AppShell>
  );
}

type ScheduleInfoDTO = { id?: string; rows: { period?: number; start: string; end: string; label?: string }[]; blocks?: { label: string; from: number; to: number }[] };

interface EditorProps<T> { selection: T; week: number; semesterWeekCount: number; onClose(): void; onSaved(): Promise<void>; onError(message: string): void }

interface CourseEditorProps extends EditorProps<CourseSelection> {
  semesterStartDate: string;
  scheduleInfo?: ScheduleInfoDTO;
  busyBlocks: BusyDTO[];
  onSkipChange(meeting: MeetingDTO, week: number, skipped: boolean): void;
  onBatchSkip(meeting: MeetingDTO, weeks: number[], previousWeeks: number[]): void;
}

interface BusyEditorProps extends EditorProps<BusySelection> {
  scheduleInfo?: ScheduleInfoDTO;
  courses: CourseDTO[];
}

interface ConflictItem { title: string; text: string }

function ConflictBox({ conflicts, kind }: { conflicts: ConflictItem[]; kind: "busy" | "course" }) {
  if (!conflicts.length) return null;
  return (
    <div className="conflict-box" role="alert">
      <strong>时间冲突（{conflicts.length}）</strong>
      <ul>{conflicts.map((conflict, index) => <li key={index}><b>{conflict.title}</b>{conflict.text}</li>)}</ul>
      <small>{kind === "course" ? "以上私人忙碌会和这门课在相同时间重叠。" : "以上课程会和这个私人忙碌在相同时间重叠。"}</small>
    </div>
  );
}

function WeekQuickPicker({ value, weekCount, onChange, open, onToggleOpen }: { value: string; weekCount: number; onChange(next: string): void; open: boolean; onToggleOpen(): void }) {
  const parsed = parseWeekRule(value, weekCount);
  const activeWeeks = new Set(parsed.recognized ? parsed.weeks : []);
  return (
    <div className="week-quick">
      <button type="button" onClick={() => onChange(`1-${weekCount}`)}>每周</button>
      <button type="button" onClick={() => onChange("单周")}>单周</button>
      <button type="button" onClick={() => onChange("双周")}>双周</button>
      <button type="button" className={open ? "on" : ""} onClick={onToggleOpen}>逐周选</button>
      {open && <div className="week-grid">{Array.from({ length: weekCount }, (_, index) => index + 1).map((weekNumber) => (
        <button type="button" key={weekNumber} className={activeWeeks.has(weekNumber) ? "on" : ""} onClick={() => onChange(toggleWeekInText(value, weekNumber, weekCount))}>{weekNumber}</button>
      ))}</div>}
    </div>
  );
}

function CourseEditor({ selection, week, semesterWeekCount, semesterStartDate, scheduleInfo, busyBlocks, onClose, onSaved, onError, onSkipChange, onBatchSkip }: CourseEditorProps) {
  const existing = selection.course;
  const [name, setName] = useState(existing?.name ?? "");
  const [instructor, setInstructor] = useState(existing?.instructor ?? "");
  const [location, setLocation] = useState(existing?.location ?? "");
  const [meetings, setMeetings] = useState(() => (existing?.meetings ?? []).map((meeting) => ({ ...meeting, key: meeting.id, weekText: weeksText(meeting.weeks, semesterWeekCount) })).concat(existing ? [] : [{ key: localId(), id: "", weekday: "monday" as Weekday, startPeriod: 1, endPeriod: 2, weeks: [], weekText: `1-${semesterWeekCount}`, skippedThisWeek: false, skippedWeeks: [] }]));
  const [pending, setPending] = useState(false);
  const [openWeekGrids, setOpenWeekGrids] = useState<string[]>([]);
  const activeMeeting = existing?.meetings.find((meeting) => meeting.id === selection.meetingId);

  // 批量「不去」：一次设置整个学期不用去的周次（水课适用）
  const [batchOpen, setBatchOpen] = useState(false);
  const [skipText, setSkipText] = useState("");
  const [skipGridOpen, setSkipGridOpen] = useState(true);
  const [batchPending, setBatchPending] = useState(false);

  function toggleBatch() {
    setBatchOpen((open) => {
      if (!open && activeMeeting) setSkipText(weeksText(activeMeeting.skippedWeeks ?? [], semesterWeekCount));
      return !open;
    });
  }

  // 预设按钮只在「该时段实际有课的周」内生效，避免标到没课的周
  function presetSkipWeeks(kind: "fromNow" | "odd" | "even") {
    if (!activeMeeting) return;
    const base = activeMeeting.weeks;
    const next = kind === "fromNow" ? base.filter((value) => value >= week)
      : kind === "odd" ? base.filter((value) => value % 2 === 1)
      : base.filter((value) => value % 2 === 0);
    setSkipText(next.length ? weeksText(next) : "");
  }

  const batchMeetingWeeks = activeMeeting?.weeks ?? [];
  const parsedSkip = parseWeekRule(skipText, semesterWeekCount);
  const effectiveSkipWeeks = parsedSkip.recognized ? parsedSkip.weeks.filter((value) => batchMeetingWeeks.includes(value)) : [];

  async function applyBatchSkip() {
    if (!activeMeeting || batchPending) return;
    setBatchPending(true);
    try {
      const previous = activeMeeting.skippedWeeks ?? [];
      await mutation(`/api/course-meetings/${activeMeeting.id}/skip`, "PUT", { weeks: effectiveSkipWeeks });
      onBatchSkip(activeMeeting, effectiveSkipWeeks, previous);
      await onSaved();
    } catch (cause) { onError(cause instanceof Error ? cause.message : "保存失败"); setBatchPending(false); }
  }

  // 实时字段级校验：错误直接显示在对应输入框下方
  const validation = useMemo(() => {
    const errors: { name?: string; meetings: Record<string, string> } = { meetings: {} };
    if (!name.trim()) errors.name = "请填写课程名称";
    for (const meeting of meetings) {
      const problems: string[] = [];
      if (meeting.endPeriod < meeting.startPeriod) problems.push("结束节次不能早于开始节次");
      if (!parseWeekRule(meeting.weekText, semesterWeekCount).recognized) problems.push("周次无法识别");
      if (problems.length) errors.meetings[meeting.key] = problems.join("；");
    }
    return errors;
  }, [name, meetings]);
  const hasFieldErrors = Boolean(validation.name) || Object.keys(validation.meetings).length > 0;

  // 未保存修改的离开确认
  const initialSnapshot = useRef(JSON.stringify([name, instructor, location, meetings.map((meeting) => [meeting.weekday, meeting.startPeriod, meeting.endPeriod, meeting.weekText])]));
  const dirty = initialSnapshot.current !== JSON.stringify([name, instructor, location, meetings.map((meeting) => [meeting.weekday, meeting.startPeriod, meeting.endPeriod, meeting.weekText])]);
  const dialogRef = useDialogBehavior(true, () => {
    if (dirty && !window.confirm("修改还没有保存，确定要关闭吗？")) return;
    onClose();
  }, false);
  // 其他学校（自定义作息）默认按时间录入：节次号对他们没有意义，直接写开始/结束时间
  const [courseMode, setCourseMode] = useState<PeriodMode>(scheduleInfo?.id === "custom" ? "time" : "school");

  // 与私人忙碌的时间冲突（星期相同、节次重叠、周次有交集）
  const conflicts = useMemo(() => {
    const items: ConflictItem[] = [];
    for (const meeting of meetings) {
      const weeks = parseWeekRule(meeting.weekText, semesterWeekCount).weeks;
      for (const block of busyBlocks) {
        if (meeting.weekday !== block.weekday) continue;
        if (meeting.startPeriod > block.endPeriod || meeting.endPeriod < block.startPeriod) continue;
        const overlap = weeks.filter((value) => block.weeks.includes(value));
        if (!overlap.length) continue;
        items.push({ title: block.title || "私人忙碌", text: `：周${dayLabels[block.weekday]} 第${block.startPeriod}–${block.endPeriod}节，${overlap.length} 周重叠` });
      }
    }
    return items;
  }, [meetings, busyBlocks]);

  async function save() {
    onError("");
    if (hasFieldErrors || pending) return;
    setPending(true);
    try {
      const normalized = meetings.map((meeting) => ({ weekday: meeting.weekday, startPeriod: Number(meeting.startPeriod), endPeriod: Number(meeting.endPeriod), weeks: parseWeekRule(meeting.weekText, semesterWeekCount).weeks }));
      await mutation(existing ? `/api/courses/${existing.id}` : "/api/courses", existing ? "PUT" : "POST", { name, instructor, location, meetings: normalized });
      await onSaved();
    } catch (cause) { onError(cause instanceof Error ? cause.message : "保存失败"); setPending(false); }
  }

  async function toggleSkip() {
    if (!activeMeeting || pending) return;
    setPending(true);
    try {
      await mutation(`/api/course-meetings/${activeMeeting.id}/skip`, "PUT", { week, skipped: !activeMeeting.skippedThisWeek });
      onSkipChange(activeMeeting, week, !activeMeeting.skippedThisWeek);
      await onSaved();
    }
    catch (cause) { onError(cause instanceof Error ? cause.message : "设置失败"); setPending(false); }
  }

  async function remove() {
    if (!existing || !window.confirm(`确认删除“${existing.name}”及其全部上课时段？`)) return;
    setPending(true);
    try { await mutation(`/api/courses/${existing.id}`, "DELETE"); await onSaved(); }
    catch (cause) { onError(cause instanceof Error ? cause.message : "删除失败"); setPending(false); }
  }

  const skipDate = weekdayDateLabel(semesterStartDate, week, activeMeeting ? WEEKDAYS.indexOf(activeMeeting.weekday) : -1);

  return <div className="editor-backdrop" onMouseDown={() => { if (dirty && !window.confirm("修改还没有保存，确定要关闭吗？")) return; onClose(); }}><section ref={dialogRef} tabIndex={-1} className="schedule-editor" role="dialog" aria-modal="true" aria-labelledby="course-editor-title" onMouseDown={(event) => event.stopPropagation()}><header><div><p className="eyebrow">COURSE</p><h2 id="course-editor-title">{existing ? "课程详情" : "添加课程"}</h2></div><button type="button" className="icon-button" aria-label="关闭" onClick={() => { if (dirty && !window.confirm("修改还没有保存，确定要关闭吗？")) return; onClose(); }}><X className="ui-icon" weight="bold" /></button></header><div className="editor-body">
    <label>课程名称<input value={name} maxLength={200} onChange={(event) => setName(event.target.value)} autoFocus /></label>
    {validation.name && <p className="field-error">{validation.name}</p>}
    <div className="editor-two"><label>教师<input value={instructor} maxLength={120} onChange={(event) => setInstructor(event.target.value)} /></label><label>地点<input value={location} maxLength={200} onChange={(event) => setLocation(event.target.value)} /></label></div>
    <ConflictBox conflicts={conflicts} kind="course" />
    <div className="meeting-editor-title"><strong>上课时段</strong><span className="mode-tabs">{periodModeTabs.map((tab) => <button type="button" key={tab.key} className={courseMode === tab.key ? "on" : ""} onClick={() => setCourseMode(tab.key)}>{tab.label}</button>)}</span><button type="button" onClick={() => setMeetings((current) => [...current, { key: localId(), id: "", weekday: "monday", startPeriod: 1, endPeriod: 2, weeks: [], weekText: `1-${semesterWeekCount}`, skippedThisWeek: false, skippedWeeks: [] }])}><Plus className="ui-icon" weight="bold" />添加时段</button></div>
    {meetings.map((meeting) => <div className={`schedule-meeting-row${validation.meetings[meeting.key] ? " invalid" : ""}`} key={meeting.key}>
      <label>星期<ThemedSelect value={meeting.weekday} ariaLabel="星期" groups={[{ options: weekdayOptions }]} onChange={(next) => setMeetings((current) => current.map((item) => item.key === meeting.key ? { ...item, weekday: next as Weekday } : item))} /></label>
      <PeriodFields mode={courseMode} scheduleInfo={scheduleInfo} startPeriod={meeting.startPeriod} endPeriod={meeting.endPeriod} onChange={(start, end) => setMeetings((current) => current.map((item) => item.key === meeting.key ? { ...item, startPeriod: start, endPeriod: Math.max(start, end) } : item))} />
      
      <label className="meeting-weeks">周次<input value={meeting.weekText} onChange={(event) => setMeetings((current) => current.map((item) => item.key === meeting.key ? { ...item, weekText: event.target.value } : item))} placeholder={`1-${semesterWeekCount} / 单周 / 双周`} /></label>
      <button type="button" className="icon-button" aria-label="删除此时段" disabled={meetings.length === 1} onClick={() => setMeetings((current) => current.filter((item) => item.key !== meeting.key))}><X className="ui-icon" weight="bold" /></button>
      <WeekQuickPicker value={meeting.weekText} weekCount={semesterWeekCount} onChange={(next) => setMeetings((current) => current.map((item) => item.key === meeting.key ? { ...item, weekText: next } : item))} open={openWeekGrids.includes(meeting.key)} onToggleOpen={() => setOpenWeekGrids((current) => current.includes(meeting.key) ? current.filter((key) => key !== meeting.key) : [...current, meeting.key])} />
      {validation.meetings[meeting.key] && <p className="field-error">{validation.meetings[meeting.key]}</p>}
    </div>)}
    {existing && activeMeeting && <div className="batch-skip">
      <button type="button" className="batch-skip-toggle" aria-expanded={batchOpen} onClick={toggleBatch}>批量标记「不去」…</button>
      {batchOpen && <>
        <p className="batch-skip-note">给「周{dayLabels[activeMeeting.weekday]} 第{activeMeeting.startPeriod}–{activeMeeting.endPeriod}节」一次性设置本学期不去的周次，适合整学期不去的水课。应用后会替换这一时段现有的「不去」标记。</p>
        <div className="week-quick batch-presets">
          <button type="button" onClick={() => presetSkipWeeks("fromNow")}>从第 {week} 周起</button>
        </div>
        <WeekQuickPicker value={skipText} weekCount={semesterWeekCount} onChange={setSkipText} open={skipGridOpen} onToggleOpen={() => setSkipGridOpen((value) => !value)} />
        <p className="busy-weeks-preview">{effectiveSkipWeeks.length ? `将标记不去：${weeksDescription(effectiveSkipWeeks)}` : "将清除该时段的全部「不去」标记"}</p>
        <button type="button" className="batch-apply" disabled={batchPending} onClick={applyBatchSkip}>{batchPending ? "应用中…" : "应用"}</button>
      </>}
    </div>}
  </div><footer>{existing && <button className="danger-link" type="button" disabled={pending} onClick={remove}>删除课程</button>}<span />{activeMeeting?.weeks.includes(week) && <button className="secondary-action" type="button" disabled={pending} onClick={toggleSkip} title="只影响这一周的这一次课">{activeMeeting.skippedThisWeek ? `恢复第 ${week} 周（${skipDate}）` : `第 ${week} 周（${skipDate}）这节不去`}</button>}<button className="editor-save" type="button" disabled={pending || hasFieldErrors} onClick={save} title={hasFieldErrors ? "请先修正标红的字段" : undefined}>{pending ? "保存中…" : "保存"}</button></footer></section></div>;
}

function BusyEditor({ scheduleInfo, selection, week, semesterWeekCount, courses, onClose, onSaved, onError }: BusyEditorProps) {
  const block = selection.block;
  const prefill = selection.prefill;
  // 从空格子点入时按点击位置预填星期与节次，默认「仅本周」
  // 新增时默认「仅本周」（当前查看周）；已有的一次性忙碌按自定义周展示，避免编辑时被悄悄改成当前周
  const initialRepeat = block ? (block.kind === "ONE_TIME" ? "CUSTOM" : weeksText(block.weeks, semesterWeekCount) === `1-${semesterWeekCount}` ? "EVERY" : weeksText(block.weeks, semesterWeekCount) === "单周" ? "ODD" : weeksText(block.weeks, semesterWeekCount) === "双周" ? "EVEN" : "CUSTOM") : "THIS_WEEK";
  const [title, setTitle] = useState(block?.title ?? "");
  const [busyMode, setBusyMode] = useState<PeriodMode>(scheduleInfo?.id === "custom" ? "time" : "school");
  const [weekday, setWeekday] = useState<Weekday>(block?.weekday ?? prefill?.weekday ?? "monday");
  const [startPeriod, setStartPeriod] = useState(block?.startPeriod ?? prefill?.startPeriod ?? 1);
  const [endPeriod, setEndPeriod] = useState(block?.endPeriod ?? prefill?.endPeriod ?? 2);
  const [repeat, setRepeat] = useState(initialRepeat);
  const [customWeeks, setCustomWeeks] = useState(block ? weeksText(block.weeks, semesterWeekCount) : String(week));
  const [pending, setPending] = useState(false);
  const [weekGridOpen, setWeekGridOpen] = useState(false);
  const dialogRef = useDialogBehavior(true, () => {
    if (pending && !window.confirm("正在保存，确定要关闭吗？")) return;
    onClose();
  }, false);

  const effectiveSource = repeat === "THIS_WEEK" ? String(week) : repeat === "EVERY" ? `1-${semesterWeekCount}` : repeat === "ODD" ? "单周" : repeat === "EVEN" ? "双周" : customWeeks;
  const effectiveWeeks = parseWeekRule(effectiveSource, semesterWeekCount);
  const customInvalid = repeat === "CUSTOM" && !effectiveWeeks.recognized;

  const conflicts = useMemo(() => {
    if (!effectiveWeeks.recognized) return [];
    const items: ConflictItem[] = [];
    for (const course of courses) {
      for (const meeting of course.meetings) {
        if (weekday !== meeting.weekday) continue;
        if (startPeriod > meeting.endPeriod || endPeriod < meeting.startPeriod) continue;
        const overlap = effectiveWeeks.weeks.filter((value) => meeting.weeks.includes(value));
        if (!overlap.length) continue;
        items.push({ title: course.name, text: `：周${dayLabels[meeting.weekday]} 第${meeting.startPeriod}–${meeting.endPeriod}节，${overlap.length} 周重叠` });
      }
    }
    return items;
  }, [weekday, startPeriod, endPeriod, effectiveWeeks, courses]);

  async function save() {
    if (pending) return;
    if (customInvalid || endPeriod < startPeriod) return onError("请检查节次和重复周次");
    setPending(true); onError("");
    try { await mutation(block ? `/api/busy-blocks/${block.id}` : "/api/busy-blocks", block ? "PUT" : "POST", { kind: repeat === "THIS_WEEK" ? "ONE_TIME" : "RECURRING", title, weekday, startPeriod, endPeriod, weeks: effectiveWeeks.weeks }); await onSaved(); }
    catch (cause) { onError(cause instanceof Error ? cause.message : "保存失败"); setPending(false); }
  }

  async function remove() {
    if (!block || !window.confirm("确认删除这个私人忙碌时段？")) return;
    setPending(true);
    try { await mutation(`/api/busy-blocks/${block.id}`, "DELETE"); await onSaved(); }
    catch (cause) { onError(cause instanceof Error ? cause.message : "删除失败"); setPending(false); }
  }

  return <div className="editor-backdrop" onMouseDown={onClose}><section ref={dialogRef} tabIndex={-1} className="schedule-editor busy-editor" role="dialog" aria-modal="true" aria-labelledby="busy-editor-title" onMouseDown={(event) => event.stopPropagation()}><header><div><p className="eyebrow">PRIVATE BUSY</p><h2 id="busy-editor-title">{block ? "编辑忙碌" : "标记忙碌"}</h2></div><button type="button" className="icon-button" aria-label="关闭" onClick={onClose}><X className="ui-icon" weight="bold" /></button></header><div className="editor-body">
    <label>标题（可选，仅自己可见）<input value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} placeholder="例如：组会" autoFocus /></label>
    <div className="mode-tabs busy-mode-tabs">{periodModeTabs.map((tab) => <button type="button" key={tab.key} className={busyMode === tab.key ? "on" : ""} onClick={() => setBusyMode(tab.key)}>{tab.label}</button>)}</div><div className="editor-three"><label>星期<ThemedSelect value={weekday} ariaLabel="星期" groups={[{ options: weekdayOptions }]} onChange={(next) => setWeekday(next as Weekday)} /></label><PeriodFields mode={busyMode} scheduleInfo={scheduleInfo} startPeriod={startPeriod} endPeriod={endPeriod} onChange={(start, end) => { setStartPeriod(start); setEndPeriod(Math.max(start, end)); }} /></div>
    <ConflictBox conflicts={conflicts} kind="busy" />
    <fieldset><legend>重复</legend>{[["THIS_WEEK", "仅本周"], ["EVERY", "每周"], ["ODD", "单周"], ["EVEN", "双周"], ["CUSTOM", "自定义"]].map(([value, label]) => <label className="radio-option" key={value}><input type="radio" name="repeat" value={value} checked={repeat === value} onChange={() => setRepeat(value)} />{label}</label>)}</fieldset>
    {repeat === "CUSTOM" && <>
      <label>自定义周次<input value={customWeeks} onChange={(event) => setCustomWeeks(event.target.value)} placeholder="1,2,5,8,12" /></label>
      {customInvalid && <p className="field-error">周次无法识别，请检查格式</p>}
      <WeekQuickPicker value={customWeeks} weekCount={semesterWeekCount} onChange={setCustomWeeks} open={weekGridOpen} onToggleOpen={() => setWeekGridOpen((value) => !value)} />
    </>}
    <p className="busy-weeks-preview">{effectiveWeeks.recognized ? `生效教学周：${weeksDescription(effectiveWeeks.weeks)}` : "周次格式无法识别，请检查"}</p>
    <p className="busy-privacy-note">其他成员只会看到“忙碌”，不会看到标题。</p>
  </div><footer>{block && <button className="danger-link" type="button" disabled={pending} onClick={remove}>删除忙碌</button>}<span /><button className="editor-save" type="button" disabled={pending || customInvalid} onClick={save}>{pending ? "保存中…" : "保存"}</button></footer></section></div>;
}
