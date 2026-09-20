"use client";

import { useEffect, useState } from "react";
import { CheckCircle, X } from "@phosphor-icons/react";
import { useDialogBehavior } from "@/components/dialog-behavior";

const MAX_CONTENT = 2000;

// 全站反馈入口：悬浮按钮 + 弹出文本框。登录与否都能提交（匿名也可）。
export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const cardRef = useDialogBehavior(open, () => setOpen(false), false);

  useEffect(() => {
    function openFeedback() { setOpen(true); setError(""); }
    window.addEventListener("op:open-feedback", openFeedback);
    return () => window.removeEventListener("op:open-feedback", openFeedback);
  }, []);

  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => {
      setOpen(false);
      setDone(false);
    }, 1800);
    return () => clearTimeout(timer);
  }, [done]);

  async function submit() {
    const trimmed = content.trim();
    if (trimmed.length < 2) return setError("再多写几个字吧");
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: trimmed, page: window.location.pathname }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? "提交失败，请稍后再试");
      }
      setContent("");
      setDone(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "提交失败，请稍后再试");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="feedback-fab"
        onClick={() => { setOpen(true); setError(""); }}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        反馈
      </button>
      {open && (
        <div className="detail-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
          <section
            ref={cardRef}
            tabIndex={-1}
            className="feedback-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedback-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button className="detail-close icon-button" type="button" onClick={() => setOpen(false)} aria-label="关闭"><X className="ui-icon" weight="bold" /></button>
            <p className="eyebrow">FEEDBACK</p>
            <h2 id="feedback-title">反馈与建议</h2>
            {done ? (
              <p className="feedback-done" role="status"><CheckCircle className="ui-icon" weight="fill" />已收到，谢谢你！</p>
            ) : (
              <>
                <textarea
                  value={content}
                  onChange={(event) => setContent(event.target.value.slice(0, MAX_CONTENT))}
                  rows={5}
                  autoFocus
                  placeholder="说说你的想法，或告诉我们哪里出了问题——例如：节次时间不对、按钮点不动、看不懂某个地方…你的反馈只有项目作者能看到。"
                  aria-label="反馈内容"
                />
                <div className="feedback-meta">
                  <small>{content.length}/{MAX_CONTENT} · 可匿名，登录用户会带上昵称便于回访</small>
                  <button type="button" disabled={pending || content.trim().length < 2} onClick={() => void submit()}>
                    {pending ? "提交中…" : "提交反馈"}
                  </button>
                </div>
                {error && <p className="admin-error" role="alert">{error}</p>}
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}
