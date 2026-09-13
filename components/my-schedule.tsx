"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { WEEKDAYS, type Weekday } from "@/src/domain/schedule";
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
  semester: { academicYear: string; semester: string; currentWeek: number; weekCount: number };
  courses: CourseDTO[];
  busyBlocks: BusyDTO[];
}

type CourseSelection = { type: "course"; course?: CourseDTO; meetingId?: string };
type BusySelection = { type: "busy"; block?: BusyDTO };
type Selection = CourseSelection | BusySelection | null;

function weeksText(weeks: number[]) {
  const value = weeks.join(",");
  if (value === Array.from({ length: 16 }, (_, i) => i + 1).join(",")) return "1-16";
  if (value === "1,3,5,7,9,11,13,15") return "单周";
  if (value === "2,4,6,8,10,12,14,16") return "双周";
  return value;
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

  const load = useCallback(async (signal?: AbortSignal) => {
    const query = week === null ? "" : `?week=${week}`;
    const response = await fetch(`/api/schedule${query}`, { signal });
    if (response.status === 401) return router.replace("/login");
    const body = await response.json() as { schedule?: ScheduleDTO; error?: string };
    if (!response.ok || !body.schedule) throw new Error(body.error ?? "无法读取个人课表");
    setSchedule(body.schedule);
    setWeek((current) => current ?? body.schedule!.week);
  }, [router, week]);

  useEffect(() => {
    const controller = new AbortController();
    setError("");
    load(controller.signal).catch((cause) => {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setError(cause instanceof Error ? cause.message : "无法读取个人课表");
    });
    return () => controller.abort();
  }, [load]);

  const visibleCourses = useMemo(() => schedule?.courses.flatMap((course) => course.meetings
    .filter((meeting) => meeting.weeks.includes(schedule.week))
    .map((meeting) => ({ course, meeting }))) ?? [], [schedule]);
  const visibleBusy = useMemo(() => schedule?.busyBlocks.filter((block) => block.weeks.includes(schedule.week)) ?? [], [schedule]);

  async function refreshAndClose() {
    await load();
    setSelection(null);
  }

  return (
    <div className="schedule-shell">
      <header className="simple-header"><a className="brand" href="/"><span className="logo-mark"><i /><i /></span><span><strong>课隙</strong><small>OpenPeriod</small></span></a><nav><a href="/">共同空闲</a><a href="/groups">群组</a></nav></header>
      <main className="schedule-page">
        <div className="schedule-heading"><div><p className="eyebrow">MY SCHEDULE</p><h1>我的课表</h1><p>{schedule ? `${schedule.semester.academicYear} ${schedule.semester.semester} · 北京大学` : "管理课程和私人忙碌时间"}</p></div><div className="schedule-heading-actions"><a href="/import">导入 Excel</a><button type="button" onClick={() => setSelection({ type: "course" })}>＋ 添加课程</button><button className="busy-action" type="button" onClick={() => setSelection({ type: "busy" })}>＋ 标记忙碌</button></div></div>
        {error && <div className="page-error" role="alert">{error}</div>}
        {schedule && week !== null ? <>
          <div className="my-week-switcher"><button type="button" aria-label="上一周" disabled={week <= 1} onClick={() => setWeek((value) => Math.max(1, (value ?? 1) - 1))}>‹</button><strong>第 {week} 周 {week === schedule.semester.currentWeek && <em>本周</em>}</strong><button type="button" aria-label="下一周" disabled={week >= schedule.semester.weekCount} onClick={() => setWeek((value) => Math.min(schedule.semester.weekCount, (value ?? 1) + 1))}>›</button></div>
          {schedule.courses.length === 0 && schedule.busyBlocks.length === 0 ? <section className="my-schedule-empty"><span className="logo-mark"><i /><i /></span><h2>你还没有课表</h2><p>上传 Excel，或手动添加第一门课程。</p><div><a href="/import">上传 Excel</a><button type="button" onClick={() => setSelection({ type: "course" })}>手动添加</button></div></section> : <div className="my-grid-scroller"><div className="my-timetable">
            <div className="my-corner">节次</div>{WEEKDAYS.map((day, index) => <div className="my-day" style={{ gridColumn: index + 2 }} key={day}>周{dayLabels[day]}</div>)}
            {Array.from({ length: 12 }, (_, index) => index + 1).map((period) => <div className="my-period" style={{ gridRow: period + 1 }} key={period}><strong>{period}</strong><small>第 {period} 节</small></div>)}
            {Array.from({ length: 84 }, (_, index) => <div className="my-grid-cell" style={{ gridColumn: index % 7 + 2, gridRow: Math.floor(index / 7) + 2 }} key={index} />)}
            {visibleCourses.map(({ course, meeting }) => <button type="button" className={`my-course-block ${meeting.skippedThisWeek ? "skipped" : ""}`} style={{ gridColumn: WEEKDAYS.indexOf(meeting.weekday) + 2, gridRow: `${meeting.startPeriod + 1} / ${meeting.endPeriod + 2}` }} onClick={() => setSelection({ type: "course", course, meetingId: meeting.id })} key={meeting.id}><strong>{course.name}</strong><span>{course.location || `${meeting.startPeriod}–${meeting.endPeriod} 节`}</span>{meeting.skippedThisWeek && <em>本周不去</em>}</button>)}
            {visibleBusy.map((block) => <button type="button" className="my-busy-block" style={{ gridColumn: WEEKDAYS.indexOf(block.weekday) + 2, gridRow: `${block.startPeriod + 1} / ${block.endPeriod + 2}` }} onClick={() => setSelection({ type: "busy", block })} key={block.id}><strong>{block.title || "忙碌"}</strong><span>{block.kind === "ONE_TIME" ? "仅本周" : "周期"}</span></button>)}
          </div></div>}
          <div className="my-schedule-legend"><span><i className="course" />课程</span><span><i className="busy" />私人忙碌</span><span><i className="skipped" />本周不去</span><small>私人忙碌标题与 Skip 状态不会对其他成员公开。</small></div>
        </> : !error && <div className="preview-loading">正在读取个人课表…</div>}
      </main>
      {selection?.type === "course" && schedule && <CourseEditor selection={selection} week={schedule.week} onClose={() => setSelection(null)} onSaved={refreshAndClose} onError={setError} />}
      {selection?.type === "busy" && schedule && <BusyEditor selection={selection} week={schedule.week} onClose={() => setSelection(null)} onSaved={refreshAndClose} onError={setError} />}
    </div>
  );
}

interface EditorProps<T> { selection: T; week: number; onClose(): void; onSaved(): Promise<void>; onError(message: string): void }

function CourseEditor({ selection, week, onClose, onSaved, onError }: EditorProps<CourseSelection>) {
  const existing = selection.course;
  const [name, setName] = useState(existing?.name ?? "");
  const [instructor, setInstructor] = useState(existing?.instructor ?? "");
  const [location, setLocation] = useState(existing?.location ?? "");
  const [meetings, setMeetings] = useState(() => (existing?.meetings ?? []).map((meeting) => ({ ...meeting, key: meeting.id, weekText: weeksText(meeting.weeks) })).concat(existing ? [] : [{ key: crypto.randomUUID(), id: "", weekday: "monday" as Weekday, startPeriod: 1, endPeriod: 2, weeks: [], weekText: "1-16", skippedThisWeek: false }]));
  const [pending, setPending] = useState(false);
  const activeMeeting = existing?.meetings.find((meeting) => meeting.id === selection.meetingId);

  async function save() {
    onError("");
    if (!name.trim()) return onError("请填写课程名称");
    const normalized = meetings.map((meeting) => ({ weekday: meeting.weekday, startPeriod: Number(meeting.startPeriod), endPeriod: Number(meeting.endPeriod), weeks: parseWeekRule(meeting.weekText) }));
    if (normalized.some((meeting) => !meeting.weeks.recognized || meeting.endPeriod < meeting.startPeriod)) return onError("请检查节次和周次设置");
    setPending(true);
    try {
      await mutation(existing ? `/api/courses/${existing.id}` : "/api/courses", existing ? "PUT" : "POST", { name, instructor, location, meetings: normalized.map((meeting) => ({ ...meeting, weeks: meeting.weeks.weeks })) });
      await onSaved();
    } catch (cause) { onError(cause instanceof Error ? cause.message : "保存失败"); setPending(false); }
  }

  async function toggleSkip() {
    if (!activeMeeting) return;
    setPending(true);
    try { await mutation(`/api/course-meetings/${activeMeeting.id}/skip`, "PUT", { week, skipped: !activeMeeting.skippedThisWeek }); await onSaved(); }
    catch (cause) { onError(cause instanceof Error ? cause.message : "设置失败"); setPending(false); }
  }

  async function remove() {
    if (!existing || !window.confirm(`确认删除“${existing.name}”及其全部上课时段？`)) return;
    setPending(true);
    try { await mutation(`/api/courses/${existing.id}`, "DELETE"); await onSaved(); }
    catch (cause) { onError(cause instanceof Error ? cause.message : "删除失败"); setPending(false); }
  }

  return <div className="editor-backdrop" onMouseDown={onClose}><section className="schedule-editor" role="dialog" aria-modal="true" aria-labelledby="course-editor-title" onMouseDown={(event) => event.stopPropagation()}><header><div><p className="eyebrow">COURSE</p><h2 id="course-editor-title">{existing ? "课程详情" : "添加课程"}</h2></div><button type="button" aria-label="关闭" onClick={onClose}>×</button></header><div className="editor-body"><label>课程名称<input value={name} maxLength={200} onChange={(event) => setName(event.target.value)} autoFocus /></label><div className="editor-two"><label>教师<input value={instructor} maxLength={120} onChange={(event) => setInstructor(event.target.value)} /></label><label>地点<input value={location} maxLength={200} onChange={(event) => setLocation(event.target.value)} /></label></div><div className="meeting-editor-title"><strong>上课时段</strong><button type="button" onClick={() => setMeetings((current) => [...current, { key: crypto.randomUUID(), id: "", weekday: "monday", startPeriod: 1, endPeriod: 2, weeks: [], weekText: "1-16", skippedThisWeek: false }])}>＋ 添加时段</button></div>{meetings.map((meeting) => <div className="schedule-meeting-row" key={meeting.key}><label>星期<select value={meeting.weekday} onChange={(event) => setMeetings((current) => current.map((item) => item.key === meeting.key ? { ...item, weekday: event.target.value as Weekday } : item))}>{WEEKDAYS.map((day) => <option value={day} key={day}>周{dayLabels[day]}</option>)}</select></label><label>开始<input type="number" min={1} max={12} value={meeting.startPeriod} onChange={(event) => setMeetings((current) => current.map((item) => item.key === meeting.key ? { ...item, startPeriod: Number(event.target.value) } : item))} /></label><label>结束<input type="number" min={1} max={12} value={meeting.endPeriod} onChange={(event) => setMeetings((current) => current.map((item) => item.key === meeting.key ? { ...item, endPeriod: Number(event.target.value) } : item))} /></label><label className="meeting-weeks">周次<input value={meeting.weekText} onChange={(event) => setMeetings((current) => current.map((item) => item.key === meeting.key ? { ...item, weekText: event.target.value } : item))} placeholder="1-16 / 单周 / 双周" /></label><button type="button" aria-label="删除此时段" disabled={meetings.length === 1} onClick={() => setMeetings((current) => current.filter((item) => item.key !== meeting.key))}>×</button></div>)}</div><footer>{existing && <button className="danger-link" type="button" disabled={pending} onClick={remove}>删除课程</button>}<span />{activeMeeting?.weeks.includes(week) && <button className="secondary-action" type="button" disabled={pending} onClick={toggleSkip}>{activeMeeting.skippedThisWeek ? "恢复本周课程" : "本周不去"}</button>}<button className="editor-save" type="button" disabled={pending} onClick={save}>{pending ? "保存中…" : "保存"}</button></footer></section></div>;
}

function BusyEditor({ selection, week, onClose, onSaved, onError }: EditorProps<BusySelection>) {
  const block = selection.block;
  const initialRepeat = block?.kind === "ONE_TIME" ? "THIS_WEEK" : weeksText(block?.weeks ?? []) === "1-16" ? "EVERY" : weeksText(block?.weeks ?? []) === "单周" ? "ODD" : weeksText(block?.weeks ?? []) === "双周" ? "EVEN" : "CUSTOM";
  const [title, setTitle] = useState(block?.title ?? "");
  const [weekday, setWeekday] = useState<Weekday>(block?.weekday ?? "monday");
  const [startPeriod, setStartPeriod] = useState(block?.startPeriod ?? 1);
  const [endPeriod, setEndPeriod] = useState(block?.endPeriod ?? 2);
  const [repeat, setRepeat] = useState(initialRepeat);
  const [customWeeks, setCustomWeeks] = useState(block ? weeksText(block.weeks) : "1,2,5");
  const [pending, setPending] = useState(false);

  async function save() {
    const source = repeat === "THIS_WEEK" ? String(week) : repeat === "EVERY" ? "1-16" : repeat === "ODD" ? "单周" : repeat === "EVEN" ? "双周" : customWeeks;
    const parsed = parseWeekRule(source);
    if (!parsed.recognized || endPeriod < startPeriod) return onError("请检查节次和重复周次");
    setPending(true); onError("");
    try { await mutation(block ? `/api/busy-blocks/${block.id}` : "/api/busy-blocks", block ? "PUT" : "POST", { kind: repeat === "THIS_WEEK" ? "ONE_TIME" : "RECURRING", title, weekday, startPeriod, endPeriod, weeks: parsed.weeks }); await onSaved(); }
    catch (cause) { onError(cause instanceof Error ? cause.message : "保存失败"); setPending(false); }
  }

  async function remove() {
    if (!block || !window.confirm("确认删除这个私人忙碌时段？")) return;
    setPending(true);
    try { await mutation(`/api/busy-blocks/${block.id}`, "DELETE"); await onSaved(); }
    catch (cause) { onError(cause instanceof Error ? cause.message : "删除失败"); setPending(false); }
  }

  return <div className="editor-backdrop" onMouseDown={onClose}><section className="schedule-editor busy-editor" role="dialog" aria-modal="true" aria-labelledby="busy-editor-title" onMouseDown={(event) => event.stopPropagation()}><header><div><p className="eyebrow">PRIVATE BUSY</p><h2 id="busy-editor-title">{block ? "编辑忙碌" : "标记忙碌"}</h2></div><button type="button" aria-label="关闭" onClick={onClose}>×</button></header><div className="editor-body"><label>标题（可选，仅自己可见）<input value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} placeholder="例如：组会" autoFocus /></label><div className="editor-three"><label>星期<select value={weekday} onChange={(event) => setWeekday(event.target.value as Weekday)}>{WEEKDAYS.map((day) => <option value={day} key={day}>周{dayLabels[day]}</option>)}</select></label><label>开始<input type="number" min={1} max={12} value={startPeriod} onChange={(event) => setStartPeriod(Number(event.target.value))} /></label><label>结束<input type="number" min={1} max={12} value={endPeriod} onChange={(event) => setEndPeriod(Number(event.target.value))} /></label></div><fieldset><legend>重复</legend>{[["THIS_WEEK", "仅本周"], ["EVERY", "每周"], ["ODD", "单周"], ["EVEN", "双周"], ["CUSTOM", "自定义"]].map(([value, label]) => <label className="radio-option" key={value}><input type="radio" name="repeat" value={value} checked={repeat === value} onChange={() => setRepeat(value)} />{label}</label>)}</fieldset>{repeat === "CUSTOM" && <label>自定义周次<input value={customWeeks} onChange={(event) => setCustomWeeks(event.target.value)} placeholder="1,2,5,8,12" /></label>}<p className="busy-privacy-note">其他成员只会看到“忙碌”，不会看到标题。</p></div><footer>{block && <button className="danger-link" type="button" disabled={pending} onClick={remove}>删除忙碌</button>}<span /><button className="editor-save" type="button" disabled={pending} onClick={save}>{pending ? "保存中…" : "保存"}</button></footer></section></div>;
}

