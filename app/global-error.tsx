"use client";

// 根布局级错误的最后兜底（error.tsx 无法覆盖根布局本身的错误）。
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="zh-CN">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#faf7f2", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <h1 style={{ fontSize: 20 }}>页面需要刷新</h1>
          <p style={{ color: "#8a7a66", fontSize: 14 }}>应用刚发布了新版本，当前页面已过期。</p>
          <button type="button" onClick={() => window.location.reload()} style={{ padding: "10px 22px", borderRadius: 10, border: 0, background: "#7a1f22", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>刷新到最新版本</button>
        </div>
      </body>
    </html>
  );
}
