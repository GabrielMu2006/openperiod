"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ImportCourseDraft, ImportPreviewPayload } from "@/src/domain/import";
import { buildEndOptions, buildPeriodOptions, getScheduleById } from "@/src/config/school-schedules";
import { ThemedSelect } from "@/components/themed-select";
import { localId } from "@/src/config/local-id";
import type { Weekday } from "@/src/domain/schedule";
import { parseWeekRule } from "@/src/domain/week-rules";

type EditableMeeting = ImportCourseDraft["meetings"][number] & { weekText: string };
type EditableCourse = Omit<ImportCourseDraft, "meetings"> & { meetings: EditableMeeting[] };

const weekdayOptions: { value: Weekday; label: string }[] = [
  { value: "monday", label: "周一" }, { value: "tuesday", label: "周二" },
  { value: "wednesday", label: "周三" }, { value: "thursday", label: "周四" },
  { value: "friday", label: "周五" }, { value: "saturday", label: "周六" },
  { value: "sunday", label: "周日" },
];

const WEEKDAY_ORDER: Weekday[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

const COURSE_COLORS = [
  "#94070a", "#1f6f43", "#205375", "#8a5a12", "#5b3a8c", "#8c2f5a", "#3a6b8c", "#5a6b1f",
];

function weekText(weeks: number[]) {
  if (weeks.length === 16) return "1-16";
  if (weeks.join(",") === "1,3,5,7,9,11,13,15") return "单周";
  if (weeks.join(",") === "2,4,6,8,10,12,14,16") return "双周";
  return weeks.join(",");
}

export function ImportPreviewEditor({ previewId }: { previewId: string }) {
  const router = useRouter();
  const [preview, setPreview] = useState<ImportPreviewPayload | null>(null);
  const [courses, setCourses] = useState<EditableCourse[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [resolvedWarnings, setResolvedWarnings] = useState<string[]>([]);
  const [showGrid, setShowGrid] = useState(false);
  const schedule = preview?.schedule ?? getScheduleById(preview?.scheduleId);

  useEffect(() => {
    if (!previewId) return setError("缺少导入预览 ID");
    fetch(`/api/import/preview/${previewId}`).then(async (response) => {
      if (response.status === 401) return router.replace("/login");
      const body = (await response.json()) as { preview?: ImportPreviewPayload; error?: string };
      if (!response.ok || !body.preview) throw new Error(body.error ?? "无法读取导入预览");
      setPreview(body.preview);
      setCourses(body.preview.courses.map((course) => ({ ...course, meetings: course.meetings.map((meeting) => ({ ...meeting, weekText: weekText(meeting.weeks) })) })));
    }).catch((cause) => setError(cause instanceof Error ? cause.message : "无法读取导入预览"));
  }, [previewId, router]);

  const meetingCount = useMemo(() => courses.reduce((sum, course) => sum + course.meetings.length, 0), [courses]);
  const courseNameById = useMemo(() => new Map(courses.map((course) => [course.id, course.name])), [courses]);
  const openWarnings = preview?.warnings.filter((warning) => !resolvedWarnings.includes(warning.id)) ?? [];
  const colorById = useMemo(() => new Map(courses.map((course, index) => [course.id, COURSE_COLORS[index % COURSE_COLORS.length]])), [courses]);

  function updateCourse(courseId: string, patch: Partial<EditableCourse>) {
    setCourses((current) => current.map((course) => course.id === courseId ? { ...course, ...patch } : course));
  }

  function updateMeeting(courseId: string, meetingId: string, patch: Partial<EditableMeeting>) {
    setCourses((current) => current.map((course) => course.id === courseId ? { ...course, meetings: course.meetings.map((meeting) => meeting.id === meetingId ? { ...meeting, ...patch } : meeting) } : course));
  }

  function addCourse() {
    setCourses((current) => [...current, {
      id: localId(), name: "", meetings: [{ id: localId(), weekday: "monday", startPeriod: 1, endPeriod: 2, weeks: Array.from({ length: 16 }, (_, index) => index + 1), weekText: "1-16", source: "手动新增" }],
    }]);
  }

  function addMeeting(courseId: string) {
    setCourses((current) => current.map((course) => course.id === courseId ? {
      ...course,
      meetings: [...course.meetings, { id: localId(), weekday: "monday", startPeriod: 1, endPeriod: 2, weeks: Array.from({ length: 16 }, (_, index) => index + 1), weekText: "1-16", source: "手动新增" }],
    } : course));
  }

  function removeMeeting(courseId: string, meetingId: string) {
    setCourses((current) => current.map((course) => course.id === courseId ? { ...course, meetings: course.meetings.filter((meeting) => meeting.id !== meetingId) } : course));
  }

  function locateWarning(courseId?: string) {
    if (!courseId) return;
    setShowGrid(false);
    requestAnimationFrame(() => {
      const card = document.querySelector<HTMLElement>(`[data-course-id="${courseId}"]`);
      card?.scrollIntoView({ behavior: "smooth", block: "center" });
      card?.classList.add("flash");
      setTimeout(() => card?.classList.remove("flash"), 1600);
    });
  }

  async function confirm() {
    setError("");
    const normalized: ImportCourseDraft[] = [];
    for (const course of courses) {
      if (!course.name.trim()) return setError("每门课程都需要填写课程名称");
      const meetings = [];
      for (const meeting of course.meetings) {
        const parsed = parseWeekRule(meeting.weekText);
        if (!parsed.recognized) return setError(`请确认“${course.name}”的周次`);
        if (meeting.endPeriod < meeting.startPeriod) return setError(`“${course.name}”的结束节次不能早于开始节次`);
        meetings.push({ ...meeting, weeks: parsed.weeks, weekText: undefined });
      }
      normalized.push({ ...course, name: course.name.trim(), instructor: course.instructor?.trim() || undefined, location: course.location?.trim() || undefined, meetings });
    }
    if (!normalized.length) return setError("请至少保留一门课程");

    setPending(true);
    try {
      const response = await fetch("/api/import/confirm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ previewId, courses: normalized }) });
      const body = (await response.json()) as { imported?: { snapshotId?: string | null }; error?: string };
      if (!response.ok) throw new Error(body.error ?? "导入失败，原课表没有改变");
      const snapshotParam = body.imported?.snapshotId ? `&snapshot=${body.imported.snapshotId}` : "";
      router.replace(`/schedule?imported=1${snapshotParam}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "导入失败，原课表没有改变");
      setPending(false);
    }
  }

  if (!preview && !error) return <div className="preview-loading">正在读取解析结果…</div>;

  return (
    <div className="preview-layout">
      <section className="preview-main">
        <ol className="import-steps" aria-label="导入步骤">
          <li className="done"><i>1</i>选择文件</li>
          <li className="current"><i>2</i>检查与修正</li>
          <li><i>3</i>完成导入</li>
        </ol>
        <div className="preview-toolbar"><strong>课表预览</strong><button type="button" className={showGrid ? "toggled" : ""} onClick={() => setShowGrid((value) => !value)}>{showGrid ? "隐藏网格预览" : "网格预览"}</button><button type="button" onClick={addCourse}>＋ 手动添加课程</button></div>
        {showGrid && (
          <div className="import-grid-wrap">
            <div className="import-grid" aria-label="导入课表网格预览（显示全部周次）">
              <div className="ig-corner" />
              {WEEKDAY_ORDER.map((day) => <div className="ig-day" key={day}>{weekdayOptions.find((option) => option.value === day)?.label}</div>)}
              {Array.from({ length: schedule.rows.length }, (_, index) => index + 1).flatMap((period) => [
                <div className="ig-period" key={`p-${period}`}>{schedule.rows[period - 1]?.label ?? period}</div>,
                ...WEEKDAY_ORDER.map((day) => {
                  const blocks = courses.flatMap((course) => course.meetings
                    .filter((meeting) => meeting.weekday === day && meeting.startPeriod <= period && meeting.endPeriod >= period)
                    .map((meeting) => ({ course, meeting })));
                  const first = blocks[0];
                  const continued = blocks.length > 0 && period > first.meeting.startPeriod;
                  return <div className={`ig-cell${first ? " filled" : ""}`} key={`${day}-${period}`} style={first ? { background: `${colorById.get(first.course.id)}22`, borderColor: colorById.get(first.course.id) } : undefined}>
                    {first && !continued && <span style={{ color: colorById.get(first.course.id) }}>{first.course.name.slice(0, 6) || "未命名"}</span>}
                  </div>;
                }),
              ])}
            </div>
            <p className="ig-note">网格预览显示全部周次的课程，用于检查星期、节次是否正确；周次请在下方课程卡里核对。</p>
          </div>
        )}
        {courses.map((course) => <article className="import-course-card" data-course-id={course.id} key={course.id}><div className="course-fields"><label>课程名称<input value={course.name} maxLength={200} onChange={(event) => updateCourse(course.id, { name: event.target.value })} /></label><label>教师<input value={course.instructor ?? ""} maxLength={120} onChange={(event) => updateCourse(course.id, { instructor: event.target.value })} /></label><label>地点<input value={course.location ?? ""} maxLength={200} onChange={(event) => updateCourse(course.id, { location: event.target.value })} /></label><button type="button" onClick={() => setCourses((current) => current.filter((item) => item.id !== course.id))}>删除</button></div>{course.meetings.map((meeting) => <div className="meeting-fields" key={meeting.id}><label>星期<select value={meeting.weekday} onChange={(event) => updateMeeting(course.id, meeting.id, { weekday: event.target.value as Weekday })}>{weekdayOptions.map((day) => <option value={day.value} key={day.value}>{day.label}</option>)}</select></label><label>开始<ThemedSelect searchable value={String(meeting.startPeriod)} ariaLabel="开始节次" groups={[{ options: buildPeriodOptions(schedule) }]} onChange={(next) => updateMeeting(course.id, meeting.id, { startPeriod: Number(next), endPeriod: Math.max(Number(next), meeting.endPeriod) })} /></label><label>结束<ThemedSelect searchable value={String(meeting.endPeriod)} ariaLabel="结束节次" groups={[{ options: buildEndOptions(schedule, Number(meeting.startPeriod) || 1) }]} onChange={(next) => updateMeeting(course.id, meeting.id, { endPeriod: Number(next) })} /></label><label className="weeks-field">周次<input value={meeting.weekText} onChange={(event) => updateMeeting(course.id, meeting.id, { weekText: event.target.value })} placeholder="1-16 / 单周 / 双周" /></label><small>{meeting.source}</small><button type="button" aria-label="删除此时段" disabled={course.meetings.length === 1} onClick={() => removeMeeting(course.id, meeting.id)}>×</button></div>)}<button type="button" className="add-meeting" onClick={() => addMeeting(course.id)}>＋ 添加时段</button></article>)}
      </section>
      <aside className="preview-aside"><h2>导入检查</h2><div className="import-stats"><span><strong>{courses.length}</strong> 门课程</span><span><strong>{meetingCount}</strong> 个上课时段</span><span className={openWarnings.length ? "warning" : ""}><strong>{openWarnings.length}</strong> 项待确认</span></div>{openWarnings.map((warning) => <div className="warning-card" key={warning.id}><strong>需要确认{warning.courseId ? ` · ${courseNameById.get(warning.courseId) ?? ""}` : ""}</strong><p>{warning.message}</p><small>来源：{warning.source}</small><div className="warning-actions">{warning.courseId && <button type="button" className="locate" onClick={() => locateWarning(warning.courseId)}>定位课程</button>}<button type="button" onClick={() => setResolvedWarnings((current) => [...current, warning.id])}>标记已解决</button></div></div>)}{preview && preview.warnings.length > 0 && openWarnings.length === 0 && <p className="all-resolved">全部警告已标记解决。</p>}<p className="atomic-note">确认后将替换本学期全部课程，课程上的“本周不去”标记会随之清除；私人忙碌不受影响。导入前的课表会自动保留 7 天，可一键恢复。确认前不会修改正式课表。</p></aside>
      {error && <div className="preview-error" role="alert">{error}</div>}
      <footer className="preview-actions"><a href="/import">取消</a><button type="button" disabled={pending || !courses.length} onClick={confirm}>{pending ? "正在导入…" : `确认导入 ${courses.length} 门课程`}</button></footer>
    </div>
  );
}
