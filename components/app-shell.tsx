"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { FeedbackButton } from "@/components/feedback-button";

const navItems = [
  { key: "availability", label: "共同空闲", href: "/", icon: "▦" },
  { key: "schedule", label: "我的课表", href: "/schedule", icon: "▤" },
  { key: "groups", label: "群组", href: "/groups", icon: "◎" },
  { key: "me", label: "我的", href: "/settings", icon: "◇" },
] as const;

export type AppShellSection = (typeof navItems)[number]["key"];

interface AppShellProps {
  active: AppShellSection;
  topbarCenter?: ReactNode;
  sidebarNote?: ReactNode;
  children: ReactNode;
}

interface SessionUser {
  nickname: string;
  email: string;
}

// 四个主页面共用的外壳：桌面固定侧栏，手机常驻底部四导航，头像打开个人菜单。
export function AppShell({ active, topbarCenter, sidebarNote, children }: AppShellProps) {
  const router = useRouter();
  const [viewer, setViewer] = useState<SessionUser | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/session", { signal: controller.signal }).then(async (response) => {
      if (response.status === 401) {
        router.replace("/login");
        return;
      }
      if (!response.ok) throw new Error("暂时无法读取身份信息");
      setViewer(((await response.json()) as { user: SessionUser }).user);
    }).catch((cause) => {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      console.error(cause);
    });
    return () => controller.abort();
  }, [router]);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  async function logout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/session", { method: "DELETE" });
    } finally {
      router.replace("/login");
    }
  }

  return (
    <div className="app-frame">
      <FeedbackButton />
      <header className="topbar">
        <a className="brand" href="/" aria-label="课隙首页"><span className="logo-mark" aria-hidden="true"><i /><i /></span><span><strong>课隙</strong><small>OpenPeriod</small></span></a>
        {topbarCenter}
        <div className="topbar-end" ref={menuRef}>
          <button type="button" className="avatar" aria-label="个人菜单" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
            {viewer?.nickname?.slice(0, 1).toUpperCase() ?? "·"}
          </button>
          {menuOpen && (
            <div className="avatar-menu" role="menu">
              <div className="avatar-menu-id"><strong>{viewer?.nickname ?? "…"}</strong><small>{viewer?.email}</small></div>
              <a role="menuitem" href="/settings" onClick={() => setMenuOpen(false)}>我的</a>
              <button role="menuitem" type="button" disabled={loggingOut} onClick={logout}>{loggingOut ? "退出中…" : "退出登录"}</button>
            </div>
          )}
        </div>
      </header>

      <aside className="sidebar" aria-label="主导航">
        <nav>{navItems.map((item) => <a className={item.key === active ? "active" : ""} aria-current={item.key === active ? "page" : undefined} href={item.href} key={item.key}><span aria-hidden="true">{item.icon}</span>{item.label}</a>)}</nav>
        {sidebarNote}
      </aside>

      <main id="main" className="main-content">{children}</main>

      <nav className="bottom-nav" aria-label="移动端主导航">
        {navItems.map((item) => <a className={item.key === active ? "active" : ""} aria-current={item.key === active ? "page" : undefined} href={item.href} key={item.key}><span aria-hidden="true">{item.icon}</span>{item.label}</a>)}
      </nav>
    </div>
  );
}
