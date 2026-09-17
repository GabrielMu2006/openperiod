"use client";

// 部署后旧页面加载失效脚本（chunk 404）等渲染错误的兜底：
// 提示用户刷新，而不是看到浏览器默认的系统错误页。
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="error-fallback">
      <span className="logo-mark" aria-hidden="true"><i /><i /></span>
      <h1>页面需要刷新</h1>
      <p>应用刚发布了新版本，当前页面已过期。点击下方按钮载入最新版本，你正在编辑的内容会丢失，但课表数据不受影响。</p>
      <div className="error-fallback-actions">
        <button type="button" onClick={() => window.location.reload()}>刷新到最新版本</button>
        <button type="button" className="link-button" onClick={() => { window.location.href = "/"; }}>返回首页</button>
      </div>
    </main>
  );
}
