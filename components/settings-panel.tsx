"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { PrivacyLevel } from "@/src/domain/schedule";

interface SessionUser {
  id: string;
  nickname: string;
  email: string;
  defaultPrivacyLevel: PrivacyLevel;
}

interface SemesterInfo {
  academicYear: string;
  semester: string;
  weekCount: number;
  startDate: string;
}

const privacyOptions: { value: PrivacyLevel; label: string; description: string }[] = [
  { value: 0, label: "仅忙 / 闲", description: "其他成员只能看到你有空或忙碌，不显示任何课程信息。" },
  { value: 1, label: "课程名称", description: "忙碌时段向成员显示课程名称，不显示教师与地点。" },
  { value: 2, label: "完整课程", description: "忙碌时段向成员显示课程名称、地点与教师。" },
];

export function SettingsPanel({ semester }: { semester: SemesterInfo }) {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [nickname, setNickname] = useState("");
  const [privacy, setPrivacy] = useState<PrivacyLevel>(1);
  const [pageError, setPageError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/session", { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 401) {
          router.replace("/login");
          return;
        }
        if (!response.ok) throw new Error("暂时无法读取身份信息");
        const body = (await response.json()) as { user: SessionUser };
        setUser(body.user);
        setNickname(body.user.nickname);
        setPrivacy(body.user.defaultPrivacyLevel);
      })
      .catch((cause) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setPageError(cause instanceof Error ? cause.message : "暂时无法读取身份信息");
      });
    return () => controller.abort();
  }, [router]);

  function pickPrivacy(value: PrivacyLevel) {
    setPrivacy(value);
    setSaved(false);
    setSaveError("");
  }

  async function save() {
    setPending(true);
    setSaveError("");
    setSaved(false);
    try {
      const response = await fetch("/api/auth/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nickname, defaultPrivacyLevel: privacy }),
      });
      const body = (await response.json()) as { user?: SessionUser; error?: string };
      if (!response.ok || !body.user) throw new Error(body.error ?? "保存失败");
      setUser(body.user);
      setNickname(body.user.nickname);
      setPrivacy(body.user.defaultPrivacyLevel);
      setSaved(true);
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setPending(false);
    }
  }

  async function logout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/session", { method: "DELETE" });
    } finally {
      router.replace("/login");
    }
  }

  return (
    <main className="settings-page">
      <header className="simple-header">
        <a className="brand" href="/"><span className="logo-mark"><i /><i /></span><span><strong>课隙</strong><small>OpenPeriod</small></span></a>
        <nav aria-label="主导航"><a href="/">共同空闲</a><a href="/schedule">我的课表</a><a href="/groups">群组</a></nav>
      </header>
      <div className="settings-content">
        <div className="settings-heading"><div><p className="eyebrow">SETTINGS</p><h1>设置</h1><p>管理你的身份、默认隐私级别与学期信息。</p></div></div>
        {pageError && <div className="page-error" role="alert">{pageError}</div>}

        <section className="settings-card" aria-labelledby="settings-profile">
          <h2 id="settings-profile">个人资料</h2>
          <label className="settings-field">昵称
            <input value={nickname} maxLength={80} disabled={!user} onChange={(event) => { setNickname(event.target.value); setSaved(false); setSaveError(""); }} />
          </label>
          <div className="settings-field">
            邮箱
            <output className="settings-static">{user?.email ?? "…"}</output>
            <p className="settings-note">邮箱当前承担你的账户身份作用。V1 不发送验证邮件。</p>
          </div>
        </section>

        <section className="settings-card" aria-labelledby="settings-privacy">
          <h2 id="settings-privacy">默认隐私级别</h2>
          <p className="settings-note">新加入的群组将使用此级别；也可以在群组卡片里按群覆盖。</p>
          <div className="privacy-options" role="radiogroup" aria-label="默认隐私级别">
            {privacyOptions.map((option) => (
              <label className={`privacy-option ${privacy === option.value ? "selected" : ""}`} key={option.value}>
                <input type="radio" name="default-privacy" value={option.value} checked={privacy === option.value} onChange={() => pickPrivacy(option.value)} disabled={!user} />
                <span><strong>{option.label}</strong><small>{option.description}</small></span>
              </label>
            ))}
          </div>
        </section>

        <section className="settings-card" aria-labelledby="settings-semester">
          <h2 id="settings-semester">学期</h2>
          <dl className="semester-facts">
            <div><dt>学校</dt><dd>北京大学</dd></div>
            <div><dt>学期</dt><dd>{semester.academicYear} {semester.semester}</dd></div>
            <div><dt>周数</dt><dd>{semester.weekCount} 周</dd></div>
            <div><dt>开始日期</dt><dd>{semester.startDate}</dd></div>
          </dl>
          <p className="settings-note">V1 暂不支持修改学校与学期。</p>
        </section>

        <section className="settings-card settings-account" aria-labelledby="settings-account">
          <h2 id="settings-account">账户</h2>
          <p className="settings-note">退出后本浏览器会清除登录状态；课表与群组数据保留。</p>
          <button className="logout-button" type="button" disabled={loggingOut || !user} onClick={logout}>{loggingOut ? "退出中…" : "退出登录"}</button>
        </section>

        <div className="settings-actions">
          <span className="settings-saved" role="status">{saved ? "已保存" : ""}</span>
          {saveError && <span className="settings-save-error" role="alert">{saveError}</span>}
          <button className="save-button" type="button" disabled={pending || !user} onClick={save}>{pending ? "保存中…" : "保存更改"}</button>
        </div>
      </div>
    </main>
  );
}
