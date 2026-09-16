import { and, eq, gt, sql } from "drizzle-orm";
import { getDatabase } from "@/src/server/db";
import { feedback } from "@/src/server/db/schema";
import { getCurrentUser } from "@/src/server/auth/session";
import { errorResponse, HttpError } from "@/src/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CONTENT = 2000;
const MAX_PER_WINDOW = 5;
const WINDOW_MS = 60 * 60 * 1000;

// 同一进程内的简易限速（按 IP + 用户），够挡手抖连点和最基础的滥用
const recentSubmissions = new Map<string, number[]>();

function rateLimited(key: string) {
  const now = Date.now();
  const hits = (recentSubmissions.get(key) ?? []).filter((time) => now - time < WINDOW_MS);
  if (hits.length >= MAX_PER_WINDOW) return true;
  hits.push(now);
  recentSubmissions.set(key, hits);
  if (recentSubmissions.size > 10_000) recentSubmissions.clear();
  return false;
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    const identityKey = user?.id ?? request.headers.get("x-forwarded-for") ?? "anonymous";
    if (rateLimited(identityKey)) throw new HttpError(429, "反馈太频繁了，请稍后再试");

    const parsed = (await request.json().catch(() => null)) as { content?: unknown; page?: unknown } | null;
    const content = typeof parsed?.content === "string" ? parsed.content.trim() : "";
    if (content.length < 2) throw new HttpError(400, "反馈内容太短了");
    if (content.length > MAX_CONTENT) throw new HttpError(400, `反馈请控制在 ${MAX_CONTENT} 字以内`);
    const page = typeof parsed?.page === "string" ? parsed.page.slice(0, 120) : null;
    const userAgent = (request.headers.get("user-agent") ?? "").slice(0, 512) || null;

    const [row] = await getDatabase()
      .insert(feedback)
      .values({ userId: user?.id ?? null, content, page, userAgent })
      .returning({ id: feedback.id });
    if (!row) throw new Error("Failed to save feedback");
    return Response.json({ ok: true }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

// 保留 GET：给 admin 总览复用统计（不在公开场景使用）
export async function GET() {
  try {
    const [row] = await getDatabase()
      .select({ total: sql<number>`count(*)::int` })
      .from(feedback)
      .where(and(eq(feedback.handled, false), gt(feedback.createdAt, sql`now() - interval '30 days'`)));
    return Response.json({ unhandledRecent: row?.total ?? 0 });
  } catch (error) {
    return errorResponse(error);
  }
}
