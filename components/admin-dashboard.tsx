"use client";

import { getScheduleById } from "@/src/config/school-schedules";
import { useCallback, useEffect, useMemo, useState } from "react";

type AdminAccount = {
  id: string;
  email: string;
  nickname: string;
  scheduleId?: string | null;
  placeholder: boolean;
  verified: boolean;
  privacy: number;
  courseCount: number;
  groupCount: number;
  createdAt: string;
};

type AdminGroup = {
  id: string;
  name: string;
  inviteCode: string;
  ownerNickname: string | null;
  ownerEmail: string | null;
  memberCount: number;
  createdAt: string;
};

type AdminFeedback = {
  id: string;
  content: string;
  page: string | null;
  userAgent: string | null;
  handled: boolean;
  createdAt: string;
  nickname: string | null;
  email: string | null;
};

type FeedbackList = { total: number; unhandled: number; truncated: boolean; items: AdminFeedback[] };

type Overview = {
  generatedAt: string;
  accounts: { total: number; truncated: boolean; items: AdminAccount[] };
  groups: { total: number; truncated: boolean; items: AdminGroup[] };
};

const STORAGE_KEY = "op-admin-key";
const privacyLabels: Record<number, string> = { 0: "仅忙/闲", 1: "课程名称", 2: "完整课程" };

function schoolNameOf(scheduleId: string | null | undefined) {
  if (!scheduleId) return "未设置";
  const preset = getScheduleById(scheduleId);
  if (preset.id !== scheduleId) return "未设置";
  return preset.school + (preset.variant ? "（" + preset.variant + "）" : "");
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function includes(haystack: string | null, needle: string) {
  return (haystack ?? "").toLowerCase().includes(needle);
}

export function AdminDashboard() {
  const [keyInput, setKeyInput] = useState("");
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [data, setData] = useState<Overview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accountQuery, setAccountQuery] = useState("");
  const [groupQuery, setGroupQuery] = useState("");
  const [feedbackList, setFeedbackList] = useState<FeedbackList | null>(null);
  const [feedbackPendingId, setFeedbackPendingId] = useState("");

  const load = useCallback(async (key: string) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/overview", { headers: { "x-admin-key": key }, cache: "no-store" });
      if (response.status === 401) {
        setError("管理密钥不正确，或服务器尚未配置 ADMIN_KEY 环境变量。");
        return false;
      }
      if (!response.ok) {
        setError(`加载失败（${response.status}），请稍后重试。`);
        return false;
      }
      setData((await response.json()) as Overview);
      return true;
    } catch {
      setError("网络错误，请检查连接后重试。");
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const loadFeedback = useCallback(async (key: string) => {
    try {
      const response = await fetch("/api/admin/feedback", { headers: { "x-admin-key": key }, cache: "no-store" });
      if (!response.ok) return;
      setFeedbackList((await response.json()) as FeedbackList);
    } catch {
      /* 反馈列表加载失败不打断主视图 */
    }
  }, []);

  const markHandled = useCallback(async (id: string, handled: boolean) => {
    if (!savedKey) return;
    setFeedbackPendingId(id);
    try {
      const response = await fetch("/api/admin/feedback", {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-admin-key": savedKey },
        body: JSON.stringify({ id, handled }),
      });
      if (response.ok) {
        setFeedbackList((current) => current ? {
          ...current,
          unhandled: current.unhandled + (handled ? -1 : 1),
          items: current.items.map((item) => item.id === id ? { ...item, handled } : item),
        } : current);
      }
    } finally {
      setFeedbackPendingId("");
    }
  }, [savedKey]);

  useEffect(() => {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      setSavedKey(stored);
      void load(stored);
      void loadFeedback(stored);
    }
  }, [load, loadFeedback]);

  async function submit() {
    const trimmed = keyInput.trim();
    if (!trimmed) return;
    if (await load(trimmed)) {
      sessionStorage.setItem(STORAGE_KEY, trimmed);
      setSavedKey(trimmed);
      setKeyInput("");
      void loadFeedback(trimmed);
    }
  }

  function signOut() {
    sessionStorage.removeItem(STORAGE_KEY);
    setSavedKey(null);
    setData(null);
    setError(null);
  }

  const accounts = data?.accounts;
  const groupsList = data?.groups;

  const filteredAccounts = useMemo(() => {
    if (!accounts) return [];
    const needle = accountQuery.trim().toLowerCase();
    if (!needle) return accounts.items;
    return accounts.items.filter((item) => includes(item.email, needle) || includes(item.nickname, needle));
  }, [accounts, accountQuery]);

  const filteredGroups = useMemo(() => {
    if (!groupsList) return [];
    const needle = groupQuery.trim().toLowerCase();
    if (!needle) return groupsList.items;
    return groupsList.items.filter((item) => includes(item.name, needle) || includes(item.ownerNickname, needle) || includes(item.ownerEmail, needle));
  }, [groupsList, groupQuery]);

  if (!savedKey) {
    return (
      <main className="admin-shell admin-gate">
        <p className="eyebrow">ADMIN</p>
        <h1>站点管理</h1>
        <p className="admin-note">此页面仅限项目所有者使用，输入管理密钥查看全站账号与群组（只读）。</p>
        <form
          className="admin-key-form"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <input
            type="password"
            value={keyInput}
            onChange={(event) => setKeyInput(event.target.value)}
            placeholder="管理密钥（ADMIN_KEY）"
            aria-label="管理密钥"
            autoComplete="off"
          />
          <button type="submit" disabled={busy || !keyInput.trim()}>
            {busy ? "验证中…" : "进入"}
          </button>
        </form>
        {error && <p className="admin-error" role="alert">{error}</p>}
      </main>
    );
  }

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <p className="eyebrow">ADMIN</p>
          <h1>站点管理</h1>
        </div>
        <div className="admin-header-actions">
          <span className="admin-badge">只读</span>
          <button type="button" onClick={() => { void load(savedKey); void loadFeedback(savedKey); }} disabled={busy}>
            {busy ? "刷新中…" : "刷新"}
          </button>
          <button type="button" className="admin-quiet" onClick={signOut}>
            退出
          </button>
        </div>
      </header>
      {error && <p className="admin-error" role="alert">{error}</p>}

      {data === null ? (
        <p className="admin-note">正在加载…</p>
      ) : (
        <>
          <p className="admin-note">
            数据生成于 {formatTime(data.generatedAt)}
            {(accounts?.truncated || groupsList?.truncated) && "（各表最多显示 500 条）"}。
          </p>
          <div className="admin-stats">
            <div><strong>{accounts?.total ?? 0}</strong><span>账号总数</span></div>
            <div><strong>{accounts?.items.filter((item) => item.verified).length ?? 0}</strong><span>已验证邮箱</span></div>
            <div><strong>{accounts?.items.filter((item) => item.placeholder).length ?? 0}</strong><span>未设昵称</span></div>
            <div><strong>{accounts?.items.filter((item) => item.courseCount > 0).length ?? 0}</strong><span>已录课表</span></div>
            <div><strong>{groupsList?.total ?? 0}</strong><span>群组总数</span></div>
            <div><strong>{feedbackList?.unhandled ?? 0}</strong><span>未处理反馈</span></div>
          </div>

          <section className="admin-card" aria-labelledby="admin-accounts">
            <div className="admin-card-head">
              <h2 id="admin-accounts">全部账号（{accounts?.total ?? 0}）</h2>
              <input type="search" value={accountQuery} onChange={(event) => setAccountQuery(event.target.value)} placeholder="搜索邮箱或昵称" aria-label="搜索账号" />
            </div>
            {filteredAccounts.length === 0 ? (
              <p className="admin-note">{accountQuery ? "没有匹配的账号。" : "还没有任何账号。"}</p>
            ) : (
              <div className="admin-table-scroll">
                <table className="admin-table">
                  <thead>
                    <tr><th>邮箱</th><th>昵称</th><th>学校</th><th>邮箱验证</th><th>默认隐私</th><th>课程</th><th>群组</th><th>注册时间</th><th>内部 ID</th></tr>
                  </thead>
                  <tbody>
                    {filteredAccounts.map((item) => (
                      <tr key={item.id}>
                        <td>{item.email}</td>
                        <td>{item.nickname}{item.placeholder && <em className="admin-flag">占位</em>}</td>
                        <td>{item.scheduleId ? schoolNameOf(item.scheduleId) : "未设置"}</td>
                        <td>{item.verified ? "已验证" : "未验证"}</td>
                        <td>{privacyLabels[item.privacy] ?? item.privacy}</td>
                        <td>{item.courseCount}</td>
                        <td>{item.groupCount}</td>
                        <td>{formatTime(item.createdAt)}</td>
                        <td className="admin-mono" title={item.id}>{item.id.slice(0, 8)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="admin-card" aria-labelledby="admin-groups">
            <div className="admin-card-head">
              <h2 id="admin-groups">全部群组（{groupsList?.total ?? 0}）</h2>
              <input type="search" value={groupQuery} onChange={(event) => setGroupQuery(event.target.value)} placeholder="搜索群名或群主" aria-label="搜索群组" />
            </div>
            {filteredGroups.length === 0 ? (
              <p className="admin-note">{groupQuery ? "没有匹配的群组。" : "还没有任何群组。"}</p>
            ) : (
              <div className="admin-table-scroll">
                <table className="admin-table">
                  <thead>
                    <tr><th>群组名</th><th>邀请码</th><th>群主</th><th>成员</th><th>创建时间</th><th>内部 ID</th></tr>
                  </thead>
                  <tbody>
                    {filteredGroups.map((item) => (
                      <tr key={item.id}>
                        <td>{item.name}</td>
                        <td className="admin-mono">{item.inviteCode}</td>
                        <td>{item.ownerNickname ?? "（账号已不存在）"}<small className="admin-sub">{item.ownerEmail}</small></td>
                        <td>{item.memberCount}</td>
                        <td>{formatTime(item.createdAt)}</td>
                        <td className="admin-mono" title={item.id}>{item.id.slice(0, 8)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="admin-card" aria-labelledby="admin-feedback">
            <div className="admin-card-head">
              <h2 id="admin-feedback">全部反馈（{feedbackList?.total ?? 0}）</h2>
              {feedbackList?.truncated && <small className="admin-note">仅显示最近 200 条</small>}
            </div>
            {(feedbackList?.items.length ?? 0) === 0 ? (
              <p className="admin-note">还没有收到任何反馈。</p>
            ) : (
              <ul className="feedback-admin-list">
                {feedbackList!.items.map((item) => (
                  <li key={item.id} className={item.handled ? "handled" : ""}>
                    <div className="feedback-admin-head">
                      <strong>{item.nickname ?? "匿名用户"}</strong>
                      <small>{item.email ?? ""} · {formatTime(item.createdAt)}{item.page ? ` · 页面 ${item.page}` : ""}</small>
                      <button
                        type="button"
                        disabled={feedbackPendingId === item.id}
                        onClick={() => void markHandled(item.id, !item.handled)}
                      >
                        {item.handled ? "标为未处理" : "标为已处理"}
                      </button>
                    </div>
                    <p>{item.content}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}
