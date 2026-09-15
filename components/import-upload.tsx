"use client";

import { useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { getScheduleById, listSchedulePresets } from "@/src/config/school-schedules";

const MAX_FILE_SIZE = 5 * 1024 * 1024;

export function ImportUpload({ initialScheduleId }: { initialScheduleId?: string | null }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [scheduleId, setScheduleId] = useState(initialScheduleId ?? "pku");
  const [customText, setCustomText] = useState("");

  const isCustom = scheduleId === "custom";
  const preset = getScheduleById(scheduleId);
  const isPku = preset.id === "pku";

  function choose(candidate?: File) {
    setError("");
    if (!candidate) return;
    const name = candidate.name.toLowerCase();
    if (!name.endsWith(".xlsx") && !name.endsWith(".xls")) return setError("当前支持 .xlsx / .xls 文件");
    if (candidate.size > MAX_FILE_SIZE) return setError("Excel 文件不能超过 5MB");
    setFile(candidate);
  }

  function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    choose(event.dataTransfer.files[0]);
  }

  function parseCustomText(text: string): { start: string; end: string }[] | null {
    const rows = text.split(/[\n;；]+/).map((line) => {
      const times = line.trim().split(/[-~—～\s,，]+/).filter(Boolean);
      return times.length >= 2 ? { start: times[0], end: times[1] } : null;
    }).filter((row): row is { start: string; end: string } => row !== null);
    return rows.length ? rows : null;
  }

  async function upload() {
    if (!file) return;
    if (isCustom) {
      const rows = parseCustomText(customText);
      if (!rows) return setError("自定义作息格式：每行一节，如「08:00 08:50」，至少一行");
      setPending(true);
      setError("");
      const form = new FormData();
      form.set("file", file);
      form.set("scheduleId", "custom");
      form.set("customRows", JSON.stringify(rows));
      try {
        const response = await fetch("/api/import/preview", { method: "POST", body: form });
        const body = (await response.json()) as { preview?: { id: string }; error?: string };
        if (response.status === 401) return router.replace("/login");
        if (!response.ok || !body.preview) throw new Error(body.error ?? "无法解析这份课表");
        router.push(`/import/preview?id=${body.preview.id}`);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "无法解析这份课表");
        setPending(false);
      }
      return;
    }
    setPending(true);
    setError("");
    const form = new FormData();
    form.set("file", file);
    form.set("scheduleId", scheduleId);
    try {
      const response = await fetch("/api/import/preview", { method: "POST", body: form });
      const body = (await response.json()) as { preview?: { id: string }; error?: string };
      if (response.status === 401) return router.replace("/login");
      if (!response.ok || !body.preview) throw new Error(body.error ?? "无法解析这份课表");
      router.push(`/import/preview?id=${body.preview.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法解析这份课表");
      setPending(false);
    }
  }

  const presets = listSchedulePresets();
  const groups: { key: "period" | "block"; label: string }[] = [
    { key: "period", label: "按小节排课（一节 40–50 分钟）" },
    { key: "block", label: "按大节排课（一节 80 分钟以上）" },
  ];

  return (
    <div className="upload-flow">
      <div className="school-picker">
        <label htmlFor="import-school">我的学校</label>
        <select id="import-school" value={scheduleId} onChange={(event) => setScheduleId(event.target.value)}>
          {groups.map((group) => (
            <optgroup label={group.label} key={group.key}>
              {presets.filter((item) => item.kind === group.key).map((item) => (
                <option value={item.id} key={item.id}>{item.school}{item.variant ? `（${item.variant}）` : ""}</option>
              ))}
            </optgroup>
          ))}
          <option value="custom">自定义作息（学校不在列表里时）</option>
        </select>
        <small>{preset.kind === "block" && !isCustom ? "该校按「大节」排课，模板与解析会自动换算成小节。" : "选好学校后，请使用对应的标准模板或教务系统导出的课表。"}</small>
        {isCustom && (
          <div style={{ marginTop: 8 }}>
            <label htmlFor="custom-rows" style={{ fontSize: 13, fontWeight: 700, color: "var(--text-secondary)" }}>自定义作息时间表</label>
            <textarea
              id="custom-rows"
              value={customText}
              onChange={(event) => setCustomText(event.target.value)}
              rows={6}
              placeholder={"每行一节，按顺序填写起止时间：\n08:00 08:50\n09:00 09:50\n10:10 11:00"}
              style={{ width: "100%", marginTop: 6, padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 10, fontVariantNumeric: "tabular-nums", fontSize: 13 }}
            />
            <small style={{ color: "var(--text-tertiary)", fontSize: 12 }}>最多 16 节；时间必须递增。Excel 里的节次号将按这里的顺序对应。</small>
          </div>
        )}
      </div>
      <div
        className={`dropzone ${dragging ? "dragging" : ""}`}
        onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={drop}
      >
        <input ref={inputRef} type="file" accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => choose(event.target.files?.[0])} hidden />
        <span className="upload-icon" aria-hidden="true">⇧</span>
        <h2>{file ? file.name : "拖入课表 Excel 文件"}</h2>
        <p>{file ? `${(file.size / 1024).toFixed(0)} KB · 可以开始解析` : isPku ? "支持北京大学教务系统导出的课表，或下方标准模板；文件只用于解析，不会被永久保存。" : `支持${preset.school}标准模板；文件只用于解析，不会被永久保存。`}</p>
        <button type="button" onClick={() => inputRef.current?.click()}>{file ? "重新选择" : "选择 Excel 文件"}</button>
        <small>支持 .xlsx / .xls，最大 5MB</small>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="upload-actions">
        {isCustom
          ? <span className="admin-note">使用上面的时间表作为节次网格，配合任意「节次/时间」格式课表导入。</span>
          : isPku
            ? <a href="/OpenPeriod-PKU-Template.xlsx" download>下载标准模板（北大教务课表格式）</a>
            : <a href={`/api/import/template?school=${preset.id}`}>下载标准模板（{preset.school}格式）</a>}
        <button type="button" disabled={!file || pending} onClick={upload}>{pending ? "正在解析…" : "解析并预览"}</button>
      </div>
    </div>
  );
}
