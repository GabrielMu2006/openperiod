"use client";

import { useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";

const MAX_FILE_SIZE = 5 * 1024 * 1024;

export function ImportUpload() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

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

  async function upload() {
    if (!file) return;
    setPending(true);
    setError("");
    const form = new FormData();
    form.set("file", file);
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

  return (
    <div className="upload-flow">
      <div
        className={`dropzone ${dragging ? "dragging" : ""}`}
        onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={drop}
      >
        <input ref={inputRef} type="file" accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => choose(event.target.files?.[0])} hidden />
        <span className="upload-icon" aria-hidden="true">⇧</span>
        <h2>{file ? file.name : "拖入 PKU 课表 Excel"}</h2>
        <p>{file ? `${(file.size / 1024).toFixed(0)} KB · 可以开始解析` : "文件只用于解析，原始 Excel 不会被永久保存。"}</p>
        <button type="button" onClick={() => inputRef.current?.click()}>{file ? "重新选择" : "选择 Excel 文件"}</button>
        <small>支持 .xlsx / .xls，最大 5MB</small>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="upload-actions"><a href="/OpenPeriod-PKU-Template.xlsx" download>下载课隙标准模板</a><button type="button" disabled={!file || pending} onClick={upload}>{pending ? "正在解析…" : "解析并预览"}</button></div>
    </div>
  );
}
