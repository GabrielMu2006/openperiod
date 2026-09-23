"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "@phosphor-icons/react";

type PeriodRow = { start: string; end: string };

function toMinutes(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return NaN;
  return h * 60 + m;
}

function fromMinutes(total: number) {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, total));
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
}

function validateRows(rows: PeriodRow[]): string {
  if (!rows.length) return "至少需要一节课";
  let previousEnd = -1;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row.start || !row.end) return `第 ${index + 1} 节时间未填完整`;
    if (!/^\d{2}:\d{2}$/.test(row.start) || !/^\d{2}:\d{2}$/.test(row.end)) return `第 ${index + 1} 节时间格式应为 HH:MM`;
    const start = toMinutes(row.start);
    const end = toMinutes(row.end);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return `第 ${index + 1} 节时间无效`;
    if (end <= start) return `第 ${index + 1} 节结束时间必须晚于开始时间`;
    if (start < previousEnd) return `第 ${index + 1} 节与上一节时间重叠，需按顺序递增`;
    previousEnd = end;
  }
  return "";
}

// 自定义学校向导（SCH-03）：逐步引导填写每节课起止时间 → 学校名称 → 提交。
// 提交后账号立即切到自定义作息，同时进入后台「学校候选」池等待人工审核收录。
export function CustomSchoolWizard({ returnTo, initialRows }: { returnTo: string; initialRows?: PeriodRow[] }) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [rows, setRows] = useState<PeriodRow[]>(initialRows?.length ? initialRows.map((row) => ({ ...row })) : [{ start: "08:00", end: "08:45" }]);
  const [schoolName, setSchoolName] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const rowsError = useMemo(() => validateRows(rows), [rows]);

  function updateRow(index: number, patch: Partial<PeriodRow>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addRow() {
    setRows((current) => {
      const last = current[current.length - 1];
      const end = last ? toMinutes(last.end) : NaN;
      const nextStart = Number.isFinite(end) ? fromMinutes(Math.min(end + 10, 23 * 60 + 59)) : "";
      const nextEnd = nextStart ? fromMinutes(Math.min(toMinutes(nextStart) + 45, 23 * 60 + 59)) : "";
      if (current.length >= 16 || !nextStart) return current;
      return [...current, { start: nextStart, end: nextEnd }];
    });
    setError("");
  }

  function removeRow(index: number) {
    setRows((current) => (current.length <= 1 ? current : current.filter((_, i) => i !== index)));
    setError("");
  }

  function goStep2() {
    if (rowsError) return setError(rowsError);
    setError("");
    setStep(2);
  }

  function goStep3() {
    if (schoolName.trim().length < 2) return setError("请填写学校名称（至少 2 个字）");
    setError("");
    setStep(3);
  }

  async function submit() {
    if (rowsError) return setError(rowsError);
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/schedule/custom-rows", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rows, schoolName }),
      });
      const body = (await response.json()) as { error?: string; submission?: unknown };
      if (!response.ok) throw new Error(body.error ?? "提交失败，请稍后再试");
      router.push(returnTo === "/import" ? "/import" : "/schedule?custom=1");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "提交失败，请稍后再试");
      setPending(false);
    }
  }

  return (
    <div className="custom-wizard">
      {step === 1 && (
        <section className="wizard-step" aria-label="填写节次时间">
          <h2>第 1 步：每节课的起止时间</h2>
          <p className="wizard-hint">按顺序填写，从第 1 节开始；时间用 24 小时制。</p>
          <div className="wizard-periods">
            {rows.map((row, index) => (
              <div className="wizard-period" key={index}>
                <span className="wizard-period-no">第 {index + 1} 节</span>
                <label>开始<input type="time" value={row.start} onChange={(event) => updateRow(index, { start: event.target.value })} aria-label={`第 ${index + 1} 节开始时间`} /></label>
                <span className="wizard-period-dash">–</span>
                <label>结束<input type="time" value={row.end} onChange={(event) => updateRow(index, { end: event.target.value })} aria-label={`第 ${index + 1} 节结束时间`} /></label>
                <button type="button" className="icon-button" onClick={() => removeRow(index)} disabled={rows.length <= 1} aria-label={`删除第 ${index + 1} 节`}><X className="ui-icon" weight="bold" /></button>
              </div>
            ))}
          </div>
          <button type="button" className="wizard-add" onClick={addRow} disabled={rows.length >= 16}><Plus className="ui-icon" weight="bold" />添加下一节（第 {rows.length + 1} 节）</button>
          {rowsError && <p className="form-error" role="alert">{rowsError}</p>}
          <div className="wizard-actions">
            <span className="wizard-counter">{rows.length} / 16 节</span>
            <button type="button" className="primary-action" onClick={goStep2}>下一步：填写学校名称</button>
          </div>
        </section>
      )}
      {step === 2 && (
        <section className="wizard-step" aria-label="填写学校名称">
          <h2>第 2 步：你们学校的名称</h2>
          <p className="wizard-hint">请填写学校全称。提交后会进入人工审核，审核通过并收录后，你的账号会自动切换到这所学校的正式作息。</p>
          <label className="wizard-name-label">学校名称
            <input value={schoolName} maxLength={40} placeholder="如：某某市某某学院" onChange={(event) => setSchoolName(event.target.value)} autoFocus />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="wizard-actions">
            <button type="button" className="link-button" onClick={() => setStep(1)}>返回修改时间</button>
            <button type="button" className="primary-action" onClick={goStep3}>下一步：确认提交</button>
          </div>
        </section>
      )}
      {step === 3 && (
        <section className="wizard-step" aria-label="确认提交">
          <h2>第 3 步：确认并提交</h2>
          <p className="wizard-hint">提交后会立即按这份作息生效，并进入人工审核队列。</p>
          <div className="wizard-summary">
            <strong>{schoolName.trim()}</strong>
            <ol>
              {rows.map((row, index) => <li key={index}>第 {index + 1} 节：{row.start} – {row.end}</li>)}
            </ol>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="wizard-actions">
            <button type="button" className="link-button" disabled={pending} onClick={() => setStep(2)}>返回修改</button>
            <button type="button" className="primary-action" disabled={pending} onClick={submit}>{pending ? "正在提交…" : "提交并生效"}</button>
          </div>
        </section>
      )}
    </div>
  );
}
