"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ImportCourseDraft, ImportPreviewPayload } from "@/src/domain/import";
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

  function updateCourse(courseId: string, patch: Partial<EditableCourse>) {
    setCourses((current) => current.map((course) => course.id === courseId ? { ...course, ...patch } : course));
  }

  function updateMeeting(courseId: string, meetingId: string, patch: Partial<EditableMeeting>) {
    setCourses((current) => current.map((course) => course.id === courseId ? { ...course, meetings: course.meetings.map((meeting) => meeting.id === meetingId ? { ...meeting, ...patch } : meeting) } : course));
  }

  function addCourse() {
    setCourses((current) => [...current, {
      id: crypto.randomUUID(), name: "", meetings: [{ id: crypto.randomUUID(), weekday: "monday", startPeriod: 1, endPeriod: 2, weeks: Array.from({ length: 16 }, (_, index) => index + 1), weekText: "1-16", source: "手动新增" }],
    }]);
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
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "导入失败，原课表没有改变");
      router.replace("/schedule?imported=1");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "导入失败，原课表没有改变");
      setPending(false);
    }
  }

  if (!preview && !error) return <div className="preview-loading">正在读取解析结果…</div>;

  return (
    <div className="preview-layout">
      <section className="preview-main">
        <div className="preview-toolbar"><strong>课表预览</strong><button type="button" onClick={addCourse}>＋ 手动添加课程</button></div>
        {courses.map((course) => <article className="import-course-card" key={course.id}><div className="course-fields"><label>课程名称<input value={course.name} maxLength={200} onChange={(event) => updateCourse(course.id, { name: event.target.value })} /></label><label>教师<input value={course.instructor ?? ""} maxLength={120} onChange={(event) => updateCourse(course.id, { instructor: event.target.value })} /></label><label>地点<input value={course.location ?? ""} maxLength={200} onChange={(event) => updateCourse(course.id, { location: event.target.value })} /></label><button type="button" onClick={() => setCourses((current) => current.filter((item) => item.id !== course.id))}>删除</button></div>{course.meetings.map((meeting) => <div className="meeting-fields" key={meeting.id}><label>星期<select value={meeting.weekday} onChange={(event) => updateMeeting(course.id, meeting.id, { weekday: event.target.value as Weekday })}>{weekdayOptions.map((day) => <option value={day.value} key={day.value}>{day.label}</option>)}</select></label><label>开始<input type="number" min={1} max={12} value={meeting.startPeriod} onChange={(event) => updateMeeting(course.id, meeting.id, { startPeriod: Number(event.target.value) })} /></label><label>结束<input type="number" min={1} max={12} value={meeting.endPeriod} onChange={(event) => updateMeeting(course.id, meeting.id, { endPeriod: Number(event.target.value) })} /></label><label className="weeks-field">周次<input value={meeting.weekText} onChange={(event) => updateMeeting(course.id, meeting.id, { weekText: event.target.value })} placeholder="1-16 / 单周 / 双周" /></label><small>{meeting.source}</small></div>)}</article>)}
      </section>
      <aside className="preview-aside"><h2>导入检查</h2><div className="import-stats"><span><strong>{courses.length}</strong> 门课程</span><span><strong>{meetingCount}</strong> 个上课时段</span><span className={preview?.warnings.length ? "warning" : ""}><strong>{preview?.warnings.length ?? 0}</strong> 项待确认</span></div>{preview?.warnings.map((warning) => <div className="warning-card" key={warning.id}><strong>需要确认</strong><p>{warning.message}</p><small>来源：{warning.source}</small></div>)}<p className="atomic-note">确认后将替换本学期全部课程，课程上的“本周不去”标记会随之清除；私人忙碌不受影响。确认前不会修改正式课表，导入失败时完整回滚。</p></aside>
      {error && <div className="preview-error" role="alert">{error}</div>}
      <footer className="preview-actions"><a href="/import">取消</a><button type="button" disabled={pending || !courses.length} onClick={confirm}>{pending ? "正在导入…" : `确认导入 ${courses.length} 门课程`}</button></footer>
    </div>
  );
}
