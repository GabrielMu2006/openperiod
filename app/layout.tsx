import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "课隙 — 找到大家共同的空档",
  description: "把课表叠起来，一眼找到大家共同的空档。",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <head>
        <link rel="stylesheet" href="/fonts/lxgw/brand.css" />
      </head>
      <body>
        {children}
        {/* ICP 备案合规：备案号展示在页面底部中间并链接工信部（构建时注入，见 .env.example） */}
        {process.env.NEXT_PUBLIC_ICP_BEIAN
          ? (
              <footer className="icp-footer">
                <a href="https://beian.miit.gov.cn/" target="_blank" rel="noreferrer noopener">
                  {process.env.NEXT_PUBLIC_ICP_BEIAN}
                </a>
              </footer>
            )
          : null}
      </body>
    </html>
  );
}
