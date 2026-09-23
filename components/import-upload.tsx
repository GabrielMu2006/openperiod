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
  // initialScheduleId 来自服务端（账号当前学校）；值为 "custom" 说明用户已完成自定义作息设置
  const [scheduleId, setScheduleId] = useState(initialScheduleId ?? "pku");
  const [aiFile, setAiFile] = useState<File | null>(null);
  const [aiText, setAiText] = useState("");
  const [aiPending, setAiPending] = useState(false);

  const isCustom = scheduleId === "custom";
  // 刚在下拉里选了「其他学校」（还没走过向导）→ 展示向导入口；已经设置过 → 直接按自定义网格导入
  const customConfigured = isCustom && initialScheduleId === "custom";
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
            { label: "其他", options: [{ value: "custom", label: "其他学校（自定义作息）" }] },
          ]}
          onChange={setScheduleId}
        />
        <small>{isCustom ? "「其他学校」：按你自定义的作息导入课表，或到「我的课表」手动添加。" : preset.kind === "block" ? "该校按「大节」排课，模板与解析会自动换算成小节。" : "选好学校后，请使用对应的标准模板或教务系统导出的课表。"}</small>
      </div>
      {isCustom && !customConfigured ? (
        <div className="custom-school-notice">
          <h2>自定义学校：先花一分钟设置作息</h2>
          <p>只需两步：① 按顺序填好每节课的起止时间；② 填写学校名称提交。之后就能按这份作息导入 Excel / 截图，或手动添加课程。</p>
          <p className="admin-note">提交后我们会人工审核，确认无误后会把你们学校收录为正式预设，你的账号也会自动切换过去。</p>
          <div className="upload-actions">
            <a className="primary-action" href="/custom-school?return=/import">开始设置（3 步，推荐电脑操作）</a>
          </div>
        </div>
      ) : (
        <>
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
            <p>{file ? `${(file.size / 1024).toFixed(0)} KB · 可以开始解析` : isCustom ? "Excel 里的节次号将按你设置的自定义作息顺序对应；文件只用于解析，不会被永久保存。" : isPku ? "支持北京大学教务系统导出的课表，或下方标准模板；文件只用于解析，不会被永久保存。" : `支持${preset.school}标准模板；文件只用于解析，不会被永久保存。`}</p>
            <button type="button" onClick={() => inputRef.current?.click()}>{file ? "重新选择" : "选择 Excel 文件"}</button>
            <small>支持 .xlsx / .xls，最大 5MB</small>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="upload-actions">
            {isCustom
              ? <a href="/custom-school?return=/import">修改自定义作息时间</a>
              : isPku
                ? <a href="/OpenPeriod-PKU-Template.xlsx" download>下载标准模板（北大教务课表格式）</a>
                : <a href={`/api/import/template?school=${preset.id}`}>下载标准模板（{preset.school}格式）</a>}
            <button type="button" disabled={!file || pending} onClick={upload}>{pending ? "正在解析…" : "解析并预览"}</button>
          </div>
          <section className="ai-import" aria-label="AI 识别导入">
            <h2>没有 Excel？让 AI 帮你读课表</h2>
            <p>上传教务系统课表截图，或直接把课表文字粘贴进来，AI 会提取课程并换算成「{isCustom ? "自定义作息" : preset.school}」的节次（用上面选的学校）。</p>
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
        </>
      )}
    </div>
  );
}
