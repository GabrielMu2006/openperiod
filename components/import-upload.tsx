"use client";

import { useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { UploadSimple } from "@phosphor-icons/react";
import { getScheduleById, listSchedulePresets } from "@/src/config/school-schedules";
import { ThemedSelect } from "@/components/themed-select";

const MAX_FILE_SIZE = 5 * 1024 * 1024;

// 学校选择器的空态操作：选「其他学校」，或反馈告诉我们补充哪所学校
export function schoolPickerEmptyFooter(onPickCustom: () => void) {
  return (
    <>
      <button type="button" onClick={onPickCustom}>选「其他学校」</button>
      <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("op:open-feedback"))}>没找到，去反馈</button>
    </>
  );
}

export function ImportUpload({ initialScheduleId }: { initialScheduleId?: string | null }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const aiInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [scheduleId, setScheduleId] = useState(initialScheduleId ?? "pku");
  const [customText, setCustomText] = useState("");
  const [aiFile, setAiFile] = useState<File | null>(null);
  const [aiText, setAiText] = useState("");
  const [aiPending, setAiPending] = useState(false);

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

  // 其他学校：只保存作息时间表（开始/结束时间），课表内容在「我的课表」手动添加
  async function saveCustomRows() {
    const rows = parseCustomText(customText);
    if (!rows) return setError("请先填写作息时间表：每行一节，如「08:00 08:50」，至少一行");
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/schedule/custom-rows", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const body = (await response.json()) as { error?: string };
      if (response.status === 401) return router.replace("/login");
      if (!response.ok) throw new Error(body.error ?? "保存作息失败，请重试");
      router.push("/schedule?custom=1");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存作息失败，请重试");
      setPending(false);
    }
  }

  function chooseAiImage(candidate?: File) {
    setError("");
    if (!candidate) return;
    if (!candidate.type.startsWith("image/")) return setError("AI 识别支持 PNG / JPG / WebP 截图");
    if (candidate.size > 5 * 1024 * 1024) return setError("截图不能超过 5MB");
    setAiFile(candidate);
    setAiText("");
  }

  async function runAi() {
    if (!aiFile && !aiText.trim()) return setError("先上传课表截图，或粘贴课表文字");
    setAiPending(true);
    setError("");
    try {
      let body: {
        mode: "image" | "text";
        image?: string;
        text?: string;
        scheduleId: string;
      };
      if (aiFile) {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error("截图读取失败"));
          reader.readAsDataURL(aiFile);
        });
        body = { mode: "image", image: dataUrl, scheduleId };
      } else {
        body = { mode: "text", text: aiText, scheduleId };
      }
      const response = await fetch("/api/import/ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const payload = (await response.json()) as { preview?: { id: string }; error?: string };
      if (response.status === 401) return router.replace("/login");
      if (!response.ok || !payload.preview) throw new Error(payload.error ?? "AI 识别失败，请重试");
      router.push(`/import/preview?id=${payload.preview.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "AI 识别失败，请重试");
      setAiPending(false);
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
        <ThemedSelect
          searchable
          value={scheduleId}
          ariaLabel="我的学校"
          placeholder="输入学校名筛选，如：对外经贸"
          emptyText="没有找到这所学校"
          emptyFooter={schoolPickerEmptyFooter(() => setScheduleId("custom"))}
          groups={[
            ...groups.map((group) => ({
              label: group.label,
              options: presets.filter((item) => item.kind === group.key).map((item) => ({ value: item.id, label: item.school + (item.variant ? "（" + item.variant + "）" : "") })),
            })),
            { label: "其他", options: [{ value: "custom", label: "其他学校（手动添加课表）" }] },
          ]}
          onChange={setScheduleId}
        />
        <small>{isCustom ? "「其他学校」暂不支持 Excel / AI 导入；填好下方作息后，到「我的课表」手动添加课程。" : preset.kind === "block" ? "该校按「大节」排课，模板与解析会自动换算成小节。" : "选好学校后，请使用对应的标准模板或教务系统导出的课表。"}</small>
        {isCustom && (
          <div style={{ marginTop: 8 }}>
            <label htmlFor="custom-rows" style={{ fontSize: 13, fontWeight: 700, color: "var(--text-secondary)" }}>作息时间表（每节课的开始与结束时间）</label>
            <textarea
              id="custom-rows"
              value={customText}
              onChange={(event) => setCustomText(event.target.value)}
              rows={6}
              placeholder={"每行一节，按顺序填写起止时间：\n08:00 08:50\n09:00 09:50\n10:10 11:00"}
              style={{ width: "100%", marginTop: 6, padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 10, fontVariantNumeric: "tabular-nums", fontSize: 13 }}
            />
            <small style={{ color: "var(--text-tertiary)", fontSize: 12 }}>最多 16 节；时间必须递增。手动添加课程时可直接写开始与结束时间，会自动对应到这里的节次。</small>
          </div>
        )}
      </div>
      {isCustom ? (
        <div className="custom-school-notice">
          <h2>其他学校：手动添加课表</h2>
          <p>你的学校不在列表里时，课隙暂不支持 Excel 与 AI 导入。只需两步：</p>
          <ol>
            <li>在上方填好你们学校的作息时间表（每节课的开始与结束时间）；</li>
            <li>保存后进入「我的课表」，点「添加课程」逐门录入——时间直接写开始与结束即可。</li>
          </ol>
          <p className="admin-note">想让我们支持你学校的 Excel / AI 导入？点右下角「反馈」告诉我们学校名字。</p>
        </div>
      ) : (
        <div
          className={`dropzone ${dragging ? "dragging" : ""}`}
          onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setDragging(false)}
          onDrop={drop}
        >
          <input ref={inputRef} type="file" accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => choose(event.target.files?.[0])} hidden />
          <span className="upload-icon" aria-hidden="true"><UploadSimple className="ui-icon" weight="regular" /></span>
          <h2>{file ? file.name : "拖入课表 Excel 文件"}</h2>
          <p>{file ? `${(file.size / 1024).toFixed(0)} KB · 可以开始解析` : isPku ? "支持北京大学教务系统导出的课表，或下方标准模板；文件只用于解析，不会被永久保存。" : `支持${preset.school}标准模板；文件只用于解析，不会被永久保存。`}</p>
          <button type="button" onClick={() => inputRef.current?.click()}>{file ? "重新选择" : "选择 Excel 文件"}</button>
          <small>支持 .xlsx / .xls，最大 5MB</small>
        </div>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="upload-actions">
        {isCustom
          ? <button type="button" disabled={pending} onClick={saveCustomRows}>{pending ? "正在保存…" : "保存作息，去手动添加课程"}</button>
          : <>
              {isPku
                ? <a href="/OpenPeriod-PKU-Template.xlsx" download>下载标准模板（北大教务课表格式）</a>
                : <a href={`/api/import/template?school=${preset.id}`}>下载标准模板（{preset.school}格式）</a>}
              <button type="button" disabled={!file || pending} onClick={upload}>{pending ? "正在解析…" : "解析并预览"}</button>
            </>}
      </div>
      {!isCustom && (
        <section className="ai-import" aria-label="AI 识别导入">
          <h2>没有 Excel？让 AI 帮你读课表</h2>
          <p>上传教务系统课表截图，或直接把课表文字粘贴进来，AI 会提取课程并换算成「{preset.school}」的节次（用上面选的学校）。</p>
          <input ref={aiInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => chooseAiImage(event.target.files?.[0])} hidden />
          <div className="ai-import-actions">
            <button type="button" onClick={() => aiInputRef.current?.click()}>{aiFile ? `已选截图：${aiFile.name.length > 18 ? aiFile.name.slice(0, 18) + "…" : aiFile.name}（重新选择）` : "上传课表截图"}</button>
            <span>或</span>
          </div>
          <textarea
            value={aiText}
            onChange={(event) => { setAiText(event.target.value); if (event.target.value) setAiFile(null); }}
            rows={4}
            placeholder={"粘贴课表文字，例如从教务系统网页直接复制：\n高等数学 周一 第3-4节 1-16周\n大学英语 周三 第1-2节 单周"}
            onDrop={(event) => { const image = event.dataTransfer.files[0]; if (image) { event.preventDefault(); chooseAiImage(image); } }}
          />
          <small>识别结果会进入下一步检查页，确认无误才导入；截图与文字仅发送给 AI 服务（智谱）用于解析，不会保存原图。每个账号每天最多 10 次，北京时间 00:00 重置；开始调用 AI 后即计入次数。</small>
          {aiFile && <small>已选截图 {((aiFile.size / 1024) | 0)} KB，可直接点击下方按钮识别。</small>}
          <button type="button" className="ai-import-submit" disabled={aiPending} onClick={runAi}>{aiPending ? "AI 识别中…（约 10–30 秒）" : "AI 识别并预览"}</button>
        </section>
      )}
    </div>
  );
}
