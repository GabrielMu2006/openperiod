import { timingSafeEqual } from "node:crypto";

// /admin 系列接口共用的密钥校验：未配置或不对一律拒绝，错误时小幅延迟防暴力尝试。
export function adminKeyMatches(provided: string, expected: string | undefined) {
  if (!expected) return false;
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function rejectUnlessAdmin(request: Request): Promise<Response | null> {
  const provided = request.headers.get("x-admin-key") ?? "";
  if (adminKeyMatches(provided, process.env.ADMIN_KEY)) return null;
  await new Promise((resolve) => setTimeout(resolve, 400));
  return Response.json({ error: "管理密钥未配置或不正确" }, { status: 401 });
}
