"use client";

import { useCallback, useEffect, useState } from "react";

type MineResponse = {
  semester: { academicYear: string; semester: string; school: string };
  default: { startDate: string; weekCount: number };
  override: { startDate: string; weekCount: number } | null;
  effective: { startDate: string; weekCount: number; currentWeek: number };
};

function formatDate(value: string) {
  const [y, m, d] = value.split("-");
  return `${Number(m)}/${Number(d)}`;
}

// 学期设置表单（USER-SEM）：开学日/周数按用户覆盖学校默认；设置页与课表信息弹窗共用。
export function SemesterSettingsForm({ compact = false }: { compact?: boolean }) {
  const [data, setData] = useState<MineResponse | null>(null);
  const [startDate, setStartDate] = useState("");
  const [weekCount, setWeekCount] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/semesters/mine", { cache: "no-store" });
      if (!response.ok) throw new Error("无法读取学期信息");
      const body = (await response.json()) as MineResponse;
      setData(body);
      setStartDate(body.effective.startDate);
      setWeekCount(String(body.effective.weekCount));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法读取学期信息");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    const week = Number(weekCount);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return setError("开学日期格式应为 YYYY-MM-DD");
    if (!Number.isInteger(week) || week < 1 || week > 52) return setError("周数应为 1–52 的整数");
    setPending(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/semesters/mine", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ startDate, weekCount: week }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "保存失败");
      setMessage("已保存，课表与导入校验将按新学期信息计算");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setPending(false);
    }
  }

  async function resetToDefault() {
    setPending(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/semesters/mine", { method: "DELETE" });
      if (!response.ok) throw new Error("恢复失败");
      setMessage("已恢复为学校默认学期信息");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "恢复失败");
    } finally {
      setPending(false);
    }
  }

  if (loading) return <p className="semester-form-loading">正在读取学期信息…</p>;
  if (!data) return <p className="semester-form-loading">{error || "无法读取学期信息"}</p>;

  const usingOverride = Boolean(data.override);
  const unchanged = startDate === data.effective.startDate && Number(weekCount) === data.effective.weekCount;

  return (
    <div className={`semester-form${compact ? " compact" : ""}`}>
      <dl className="semester-facts">
        <div><dt>学期</dt><dd>{data.semester.academicYear} {data.semester.semester}</dd></div>
        <div><dt>当前生效</dt><dd>{formatDate(data.effective.startDate)} 开学 · {data.effective.weekCount} 周</dd></div>
        <div><dt>学校默认</dt><dd>{formatDate(data.default.startDate)} 开学 · {data.default.weekCount} 周</dd></div>
      </dl>
      <div className="semester-form-fields">
        <label>开学日期<input type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); setMessage(""); }} /></label>
        <label>周数<input type="number" min={1} max={52} value={weekCount} onChange={(event) => { setWeekCount(event.target.value); setMessage(""); }} /></label>
      </div>
      <p className="settings-note">影响你的教学周计算、导入周次校验和共同空闲换算；只对你自己生效，同校其他用户不受影响。</p>
      {message && <p className="settings-saved" role="status">{message}</p>}
      {error && <p className="settings-save-error" role="alert">{error}</p>}
      <div className="semester-form-actions">
        <button type="button" disabled={pending || unchanged} onClick={save}>{pending ? "保存中…" : "保存修改"}</button>
        {usingOverride && <button type="button" className="link-button" disabled={pending} onClick={resetToDefault}>恢复学校默认</button>}
        {!usingOverride && unchanged && <span className="settings-note">当前与学校默认一致</span>}
      </div>
    </div>
  );
}
