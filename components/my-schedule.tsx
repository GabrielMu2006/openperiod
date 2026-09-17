"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { useDialogBehavior } from "@/components/dialog-behavior";
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

interface MeetingDTO {
  id: string;
  weekday: Weekday;
  startPeriod: number;
  endPeriod: number;
  weeks: number[];
  skippedThisWeek: boolean;
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
  semester: { academicYear: string; semester: string; currentWeek: number; weekCount: number; startDate: string; scheduleId?: string | null; schedule?: { id: string; school: string; kind: "period" | "block"; rows: { start: string; end: string; label?: string }[]; blocks?: { label: string; from: number; to: number }[] } };
  courses: CourseDTO[];
  busyBlocks: BusyDTO[];
}

type CourseSelection = { type: "course"; course?: CourseDTO; meetingId?: string };
type BusySelection = { type: "busy"; block?: BusyDTO };
type Selection = CourseSelection | BusySelection | null;
type Notice = { text: string; undo?: () => Promise<void> } | null;

function weeksText(weeks: number[]) {
  const value = weeks.join(",");
  if (value === Array.from({ length: 16 }, (_, i) => i + 1).join(",")) return "1-16";
  if (value === "1,3,5,7,9,11,13,15") return "单周";
  if (value === "2,4,6,8,10,12,14,16") return "双周";
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

// 在现有周次文本里翻转某一周，返回新的周次文本
function toggleWeekInText(currentText: string, week: number) {
  const parsed = parseWeekRule(currentText);
  const set = new Set(parsed.recognized ? parsed.weeks : Array.from({ length: 16 }, (_, i) => i + 1));
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
  const [week, setWeek] = useState<number | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const [snapshotId, setSnapshotId] = useState("");
  const [restoring, setRestoring] = useState(false);
  const [swipeHintVisible, setSwipeHintVisible] = useState(true);
  const [retryKey, setRetryKey] = useState(0);
  const mySchedule = schedule?.semester.schedule ?? getScheduleForSemester(schedule?.semester);
  const [infoOpen, setInfoOpen] = useState(false);
  const [showInfoBanner, setShowInfoBanner] = useState(false);
  const infoRef = useDialogBehavior(infoOpen, () => setInfoOpen(false), false);
  const scheduleKey = schedule ? (schedule.semester.schedule?.id ?? schedule.semester.scheduleId ?? "pku") : "pku";

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
    }
  }, []);

  // 提示条 12 秒后自动消失（撤销按钮也随之收起）
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 12_000);
    return () => clearTimeout(timer);
  }, [notice]);

  const load = useCallback(async (signal?: AbortSignal) => {
    // 教学周优先从链接恢复（?week=N），链接里没有才用服务器的当前周
    const params = new URLSearchParams(window.location.search);
    const urlWeek = Number(params.get("week"));
    const targetWeek = week ?? (Number.isInteger(urlWeek) && urlWeek >= 1 && urlWeek <= 16 ? urlWeek : null);
    const response = await fetch(`/api/schedule${targetWeek === null ? "" : `?week=${targetWeek}`}`, { signal });
    if (response.status === 401) return router.replace("/login");
    const body = await response.json() as { schedule?: ScheduleDTO; error?: string };
    if (!response.ok || !body.schedule) throw new Error(body.error ?? "无法读取个人课表");
    setSchedule(body.schedule);
    setWeek((current) => current ?? targetWeek ?? body.schedule!.week);
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

  return (
    <AppShell active="schedule">
      <div className="schedule-page">
        <div className="schedule-heading"><div><p className="eyebrow">MY SCHEDULE</p><h1>我的课表</h1><p>{schedule ? `${schedule.semester.academicYear} ${schedule.semester.semester}` : "管理课程和私人忙碌时间"}</p></div><div className="schedule-heading-actions"><button type="button" onClick={() => openScheduleInfo()}>查看课表信息</button><a href="/import">导入 Excel</a><button type="button" onClick={() => setSelection({ type: "course" })}>＋ 添加课程</button><button className="busy-action" type="button" onClick={() => setSelection({ type: "busy" })}>＋ 标记忙碌</button></div></div>
        {error && <div className="page-error" role="alert">{error}<button type="button" onClick={() => { setError(""); setRetryKey((key) => key + 1); }}>重试</button></div>}
        {showInfoBanner && schedule && <div className="schedule-info-banner" role="status"><span>你的课表按「{schedule.semester.schedule?.school ?? "北京大学"}」作息显示，建议核对节次与时间是否正确。</span><span className="banner-actions"><button type="button" onClick={() => openScheduleInfo()}>查看课表信息</button><button type="button" className="link-button" onClick={() => { localStorage.setItem("op-schedule-info-seen", scheduleKey); setShowInfoBanner(false); }}>我知道了</button></span></div>}
        {notice && <div className="page-success" role="status">{notice.text}{notice.undo && <button type="button" className="link-button" onClick={notice.undo}>撤销</button>}{snapshotId && <button type="button" className="link-button" disabled={restoring} onClick={restoreSnapshot}>{restoring ? "恢复中…" : "恢复导入前的课表"}</button>}</div>}
        {schedule && week !== null ? <>
          <div className="my-week-switcher"><button type="button" aria-label="上一周" disabled={week <= 1} onClick={() => setWeek((value) => Math.max(1, (value ?? 1) - 1))}>‹</button><strong>第 {week} 周 {week === schedule.semester.currentWeek && <em>本周</em>}</strong><button type="button" aria-label="下一周" disabled={week >= schedule.semester.weekCount} onClick={() => setWeek((value) => Math.min(schedule.semester.weekCount, (value ?? 1) + 1))}>›</button></div>
          {schedule.courses.length === 0 && schedule.busyBlocks.length === 0 ? <section className="my-schedule-empty"><span className="logo-mark"><i /><i /></span><h2>你还没有课表</h2><p>上传 Excel，或手动添加第一门课程。</p><div><a href="/import">上传 Excel</a><button type="button" onClick={() => setSelection({ type: "course" })}>手动添加</button></div></section> : <div className="my-grid-scroller" onScroll={(event) => { if (swipeHintVisible && event.currentTarget.scrollLeft > 12) setSwipeHintVisible(false); }}><div className="my-timetable">
            <div className="my-corner">节次</div>{WEEKDAYS.map((day, index) => <div className="my-day" style={{ gridColumn: index + 2 }} key={day}>周{dayLabels[day]}</div>)}
            {Array.from({ length: schedulePeriodCount(mySchedule) }, (_, index) => index + 1).map((period) => <div className="my-period" style={{ gridRow: period + 1 }} key={period}><strong>{period}</strong><small>{mySchedule.rows[period - 1]?.label ?? `第 ${period} 节`}</small></div>)}
            {Array.from({ length: schedulePeriodCount(mySchedule) * 7 }, (_, index) => <div className="my-grid-cell" style={{ gridColumn: index % 7 + 2, gridRow: Math.floor(index / 7) + 2 }} key={index} />)}
            {visibleCourses.map(({ course, meeting }) => <button type="button" className={`my-course-block ${meeting.skippedThisWeek ? "skipped" : ""}`} style={{ gridColumn: WEEKDAYS.indexOf(meeting.weekday) + 2, gridRow: `${meeting.startPeriod + 1} / ${meeting.endPeriod + 2}` }} onClick={() => setSelection({ type: "course", course, meetingId: meeting.id })} key={meeting.id}><strong>{course.name}</strong><span>{course.location || `${meeting.startPeriod}–${meeting.endPeriod} 节`}</span>{meeting.skippedThisWeek && <em>本周不去</em>}</button>)}
            {visibleBusy.map((block) => <button type="button" className="my-busy-block" style={{ gridColumn: WEEKDAYS.indexOf(block.weekday) + 2, gridRow: `${block.startPeriod + 1} / ${block.endPeriod + 2}` }} onClick={() => setSelection({ type: "busy", block })} key={block.id}><strong>{block.title || "忙碌"}</strong><span>{block.kind === "ONE_TIME" ? `仅第 ${block.weeks.join(",")} 周` : "周期"}</span></button>)}
          </div><span className={`swipe-hint${swipeHintVisible ? "" : " gone"}`} aria-hidden="true">← 表格可左右滑动 →</span></div>}
          {infoOpen && mySchedule && <div className="detail-backdrop" role="presentation" onMouseDown={() => setInfoOpen(false)}><section ref={infoRef} tabIndex={-1} className="schedule-editor info-editor" role="dialog" aria-modal="true" aria-labelledby="schedule-info-title" onMouseDown={(event) => event.stopPropagation()}><header><div><p className="eyebrow">SCHEDULE INFO</p><h2 id="schedule-info-title">{mySchedule.school}作息（{mySchedule.rows.length} 节）</h2></div><button type="button" aria-label="关闭" onClick={() => setInfoOpen(false)}>×</button></header><div className="editor-body"><table className="info-period-table"><thead><tr><th>节次</th><th>时间</th></tr></thead><tbody>{mySchedule.rows.map((row, index) => <tr key={index}><td>{row.label ?? "第 " + (index + 1) + " 节"}</td><td>{row.start} – {row.end}</td></tr>)}</tbody></table><p className="admin-note">手动添加课程/忙碌时，这里的节次号与上表一一对应。如果时间与你们学校的实际作息不符，请告诉我们。</p><div className="feedback-meta"><button type="button" onClick={() => { window.dispatchEvent(new CustomEvent("op:open-feedback")); setInfoOpen(false); }}>有问题，去反馈</button><button type="button" className="link-button" onClick={() => setInfoOpen(false)}>关闭</button></div></div></section></div>}
      <div className="my-schedule-legend"><span><i className="course" />课程</span><span><i className="busy" />私人忙碌</span><span><i className="skipped" />本周不去</span><small>私人忙碌标题与 Skip 状态不会对其他成员公开。</small></div>
        </> : !error && <div className="preview-loading">正在读取个人课表…</div>}
      </div>
      {selection?.type === "course" && schedule && <CourseEditor selection={selection} week={schedule.week} semesterStartDate={schedule.semester.startDate} scheduleInfo={schedule.semester.schedule} busyBlocks={schedule.busyBlocks} onClose={() => setSelection(null)} onSaved={refreshAndClose} onError={setError} onSkipChange={handleSkipChange} />}
      {selection?.type === "busy" && schedule && <BusyEditor selection={selection} week={schedule.week} scheduleInfo={schedule.semester.schedule} courses={schedule.courses} onClose={() => setSelection(null)} onSaved={refreshAndClose} onError={setError} />}
    </AppShell>
  );
}

interface EditorProps<T> { selection: T; week: number; onClose(): void; onSaved(): Promise<void>; onError(message: string): void }

interface CourseEditorProps extends EditorProps<CourseSelection> {
  semesterStartDate: string;
  scheduleInfo?: { rows: { period?: number; start: string; end: string; label?: string }[]; blocks?: { label: string; from: number; to: number }[] };
  busyBlocks: BusyDTO[];
  onSkipChange(meeting: MeetingDTO, week: number, skipped: boolean): void;
}

interface BusyEditorProps extends EditorProps<BusySelection> {
  scheduleInfo?: { rows: { period?: number; start: string; end: string; label?: string }[]; blocks?: { label: string; from: number; to: number }[] };
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

function WeekQuickPicker({ value, onChange, open, onToggleOpen }: { value: string; onChange(next: string): void; open: boolean; onToggleOpen(): void }) {
  const parsed = parseWeekRule(value);
  const activeWeeks = new Set(parsed.recognized ? parsed.weeks : []);
  return (
    <div className="week-quick">
      <button type="button" onClick={() => onChange("1-16")}>每周</button>
      <button type="button" onClick={() => onChange("单周")}>单周</button>
      <button type="button" onClick={() => onChange("双周")}>双周</button>
      <button type="button" className={open ? "on" : ""} onClick={onToggleOpen}>逐周选</button>
      {open && <div className="week-grid">{Array.from({ length: 16 }, (_, index) => index + 1).map((weekNumber) => (
        <button type="button" key={weekNumber} className={activeWeeks.has(weekNumber) ? "on" : ""} onClick={() => onChange(toggleWeekInText(value, weekNumber))}>{weekNumber}</button>
      ))}</div>}
    </div>
  );
}

function CourseEditor({ selection, week, semesterStartDate, scheduleInfo, busyBlocks, onClose, onSaved, onError, onSkipChange }: CourseEditorProps) {
  const existing = selection.course;
  const [name, setName] = useState(existing?.name ?? "");
  const [instructor, setInstructor] = useState(existing?.instructor ?? "");
  const [location, setLocation] = useState(existing?.location ?? "");
  const [meetings, setMeetings] = useState(() => (existing?.meetings ?? []).map((meeting) => ({ ...meeting, key: meeting.id, weekText: weeksText(meeting.weeks) })).concat(existing ? [] : [{ key: localId(), id: "", weekday: "monday" as Weekday, startPeriod: 1, endPeriod: 2, weeks: [], weekText: "1-16", skippedThisWeek: false }]));
  const [pending, setPending] = useState(false);
  const [openWeekGrids, setOpenWeekGrids] = useState<string[]>([]);
  const activeMeeting = existing?.meetings.find((meeting) => meeting.id === selection.meetingId);

  // 实时字段级校验：错误直接显示在对应输入框下方
  const validation = useMemo(() => {
    const errors: { name?: string; meetings: Record<string, string> } = { meetings: {} };
    if (!name.trim()) errors.name = "请填写课程名称";
    for (const meeting of meetings) {
      const problems: string[] = [];
      if (meeting.endPeriod < meeting.startPeriod) problems.push("结束节次不能早于开始节次");
      if (!parseWeekRule(meeting.weekText).recognized) problems.push("周次无法识别");
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
  const [courseMode, setCourseMode] = useState<PeriodMode>("school");

  // 与私人忙碌的时间冲突（星期相同、节次重叠、周次有交集）
  const conflicts = useMemo(() => {
    const items: ConflictItem[] = [];
    for (const meeting of meetings) {
      const weeks = parseWeekRule(meeting.weekText).weeks;
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
      const normalized = meetings.map((meeting) => ({ weekday: meeting.weekday, startPeriod: Number(meeting.startPeriod), endPeriod: Number(meeting.endPeriod), weeks: parseWeekRule(meeting.weekText).weeks }));
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

  return <div className="editor-backdrop" onMouseDown={() => { if (dirty && !window.confirm("修改还没有保存，确定要关闭吗？")) return; onClose(); }}><section ref={dialogRef} tabIndex={-1} className="schedule-editor" role="dialog" aria-modal="true" aria-labelledby="course-editor-title" onMouseDown={(event) => event.stopPropagation()}><header><div><p className="eyebrow">COURSE</p><h2 id="course-editor-title">{existing ? "课程详情" : "添加课程"}</h2></div><button type="button" aria-label="关闭" onClick={() => { if (dirty && !window.confirm("修改还没有保存，确定要关闭吗？")) return; onClose(); }}>×</button></header><div className="editor-body">
    <label>课程名称<input value={name} maxLength={200} onChange={(event) => setName(event.target.value)} autoFocus /></label>
    {validation.name && <p className="field-error">{validation.name}</p>}
    <div className="editor-two"><label>教师<input value={instructor} maxLength={120} onChange={(event) => setInstructor(event.target.value)} /></label><label>地点<input value={location} maxLength={200} onChange={(event) => setLocation(event.target.value)} /></label></div>
    <ConflictBox conflicts={conflicts} kind="course" />
    <div className="meeting-editor-title"><strong>上课时段</strong><span className="mode-tabs">{periodModeTabs.map((tab) => <button type="button" key={tab.key} className={courseMode === tab.key ? "on" : ""} onClick={() => setCourseMode(tab.key)}>{tab.label}</button>)}</span><button type="button" onClick={() => setMeetings((current) => [...current, { key: localId(), id: "", weekday: "monday", startPeriod: 1, endPeriod: 2, weeks: [], weekText: "1-16", skippedThisWeek: false }])}>＋ 添加时段</button></div>
    {meetings.map((meeting) => <div className={`schedule-meeting-row${validation.meetings[meeting.key] ? " invalid" : ""}`} key={meeting.key}>
      <label>星期<select value={meeting.weekday} onChange={(event) => setMeetings((current) => current.map((item) => item.key === meeting.key ? { ...item, weekday: event.target.value as Weekday } : item))}>{WEEKDAYS.map((day) => <option value={day} key={day}>周{dayLabels[day]}</option>)}</select></label>
      <PeriodFields mode={courseMode} scheduleInfo={scheduleInfo} startPeriod={meeting.startPeriod} endPeriod={meeting.endPeriod} onChange={(start, end) => setMeetings((current) => current.map((item) => item.key === meeting.key ? { ...item, startPeriod: start, endPeriod: Math.max(start, end) } : item))} />
      
      <label className="meeting-weeks">周次<input value={meeting.weekText} onChange={(event) => setMeetings((current) => current.map((item) => item.key === meeting.key ? { ...item, weekText: event.target.value } : item))} placeholder="1-16 / 单周 / 双周" /></label>
      <button type="button" aria-label="删除此时段" disabled={meetings.length === 1} onClick={() => setMeetings((current) => current.filter((item) => item.key !== meeting.key))}>×</button>
      <WeekQuickPicker value={meeting.weekText} onChange={(next) => setMeetings((current) => current.map((item) => item.key === meeting.key ? { ...item, weekText: next } : item))} open={openWeekGrids.includes(meeting.key)} onToggleOpen={() => setOpenWeekGrids((current) => current.includes(meeting.key) ? current.filter((key) => key !== meeting.key) : [...current, meeting.key])} />
      {validation.meetings[meeting.key] && <p className="field-error">{validation.meetings[meeting.key]}</p>}
    </div>)}
  </div><footer>{existing && <button className="danger-link" type="button" disabled={pending} onClick={remove}>删除课程</button>}<span />{activeMeeting?.weeks.includes(week) && <button className="secondary-action" type="button" disabled={pending} onClick={toggleSkip} title="只影响这一周的这一次课">{activeMeeting.skippedThisWeek ? `恢复第 ${week} 周（${skipDate}）` : `第 ${week} 周（${skipDate}）这节不去`}</button>}<button className="editor-save" type="button" disabled={pending || hasFieldErrors} onClick={save} title={hasFieldErrors ? "请先修正标红的字段" : undefined}>{pending ? "保存中…" : "保存"}</button></footer></section></div>;
}

function BusyEditor({ scheduleInfo, selection, week, courses, onClose, onSaved, onError }: BusyEditorProps) {
  const block = selection.block;
  // 新增时默认「仅本周」（当前查看周）；已有的一次性忙碌按自定义周展示，避免编辑时被悄悄改成当前周
  const initialRepeat = block ? (block.kind === "ONE_TIME" ? "CUSTOM" : weeksText(block.weeks) === "1-16" ? "EVERY" : weeksText(block.weeks) === "单周" ? "ODD" : weeksText(block.weeks) === "双周" ? "EVEN" : "CUSTOM") : "THIS_WEEK";
  const [title, setTitle] = useState(block?.title ?? "");
  const [busyMode, setBusyMode] = useState<PeriodMode>("school");
  const [weekday, setWeekday] = useState<Weekday>(block?.weekday ?? "monday");
  const [startPeriod, setStartPeriod] = useState(block?.startPeriod ?? 1);
  const [endPeriod, setEndPeriod] = useState(block?.endPeriod ?? 2);
  const [repeat, setRepeat] = useState(initialRepeat);
  const [customWeeks, setCustomWeeks] = useState(block ? weeksText(block.weeks) : String(week));
  const [pending, setPending] = useState(false);
  const [weekGridOpen, setWeekGridOpen] = useState(false);
  const dialogRef = useDialogBehavior(true, () => {
    if (pending && !window.confirm("正在保存，确定要关闭吗？")) return;
    onClose();
  }, false);

  const effectiveSource = repeat === "THIS_WEEK" ? String(week) : repeat === "EVERY" ? "1-16" : repeat === "ODD" ? "单周" : repeat === "EVEN" ? "双周" : customWeeks;
  const effectiveWeeks = parseWeekRule(effectiveSource);
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

  return <div className="editor-backdrop" onMouseDown={onClose}><section ref={dialogRef} tabIndex={-1} className="schedule-editor busy-editor" role="dialog" aria-modal="true" aria-labelledby="busy-editor-title" onMouseDown={(event) => event.stopPropagation()}><header><div><p className="eyebrow">PRIVATE BUSY</p><h2 id="busy-editor-title">{block ? "编辑忙碌" : "标记忙碌"}</h2></div><button type="button" aria-label="关闭" onClick={onClose}>×</button></header><div className="editor-body">
    <label>标题（可选，仅自己可见）<input value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} placeholder="例如：组会" autoFocus /></label>
    <div className="mode-tabs busy-mode-tabs">{periodModeTabs.map((tab) => <button type="button" key={tab.key} className={busyMode === tab.key ? "on" : ""} onClick={() => setBusyMode(tab.key)}>{tab.label}</button>)}</div><div className="editor-three"><label>星期<select value={weekday} onChange={(event) => setWeekday(event.target.value as Weekday)}>{WEEKDAYS.map((day) => <option value={day} key={day}>周{dayLabels[day]}</option>)}</select></label><PeriodFields mode={busyMode} scheduleInfo={scheduleInfo} startPeriod={startPeriod} endPeriod={endPeriod} onChange={(start, end) => { setStartPeriod(start); setEndPeriod(Math.max(start, end)); }} /></div>
    <ConflictBox conflicts={conflicts} kind="busy" />
    <fieldset><legend>重复</legend>{[["THIS_WEEK", "仅本周"], ["EVERY", "每周"], ["ODD", "单周"], ["EVEN", "双周"], ["CUSTOM", "自定义"]].map(([value, label]) => <label className="radio-option" key={value}><input type="radio" name="repeat" value={value} checked={repeat === value} onChange={() => setRepeat(value)} />{label}</label>)}</fieldset>
    {repeat === "CUSTOM" && <>
      <label>自定义周次<input value={customWeeks} onChange={(event) => setCustomWeeks(event.target.value)} placeholder="1,2,5,8,12" /></label>
      {customInvalid && <p className="field-error">周次无法识别，请检查格式</p>}
      <WeekQuickPicker value={customWeeks} onChange={setCustomWeeks} open={weekGridOpen} onToggleOpen={() => setWeekGridOpen((value) => !value)} />
    </>}
    <p className="busy-weeks-preview">{effectiveWeeks.recognized ? `生效教学周：${weeksDescription(effectiveWeeks.weeks)}` : "周次格式无法识别，请检查"}</p>
    <p className="busy-privacy-note">其他成员只会看到“忙碌”，不会看到标题。</p>
  </div><footer>{block && <button className="danger-link" type="button" disabled={pending} onClick={remove}>删除忙碌</button>}<span /><button className="editor-save" type="button" disabled={pending || customInvalid} onClick={save}>{pending ? "保存中…" : "保存"}</button></footer></section></div>;
}
