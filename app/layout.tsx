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
        <link rel="stylesheet" href="/fonts/lxgw/lxgw.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
