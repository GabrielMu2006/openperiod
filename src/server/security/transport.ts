export interface TransportEnvironment {
  NODE_ENV?: string;
  AUTH_ORIGIN?: string;
  TRUST_PROXY_HEADERS?: string;
}

export interface TransportRequest {
  method: string;
  url: string;
  headers: { get(name: string): string | null };
}

export type TransportDecision =
  | { action: "allow"; production: boolean }
  | { action: "redirect"; location: string; status: 308 }
  | { action: "reject"; status: 421 | 426 | 503; message: string };

function canonicalOrigin(value: string | undefined) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) return null;
    return parsed;
  } catch {
    return null;
  }
}

function canonicalLocation(origin: URL, requestUrl: URL) {
  const target = new URL(origin.origin);
  // Assigning fields avoids treating a path beginning with // as another host.
  target.pathname = requestUrl.pathname;
  target.search = requestUrl.search;
  return target.toString();
}

export function assessTransport(request: TransportRequest, env: TransportEnvironment): TransportDecision {
  if (env.NODE_ENV !== "production") return { action: "allow", production: false };

  const origin = canonicalOrigin(env.AUTH_ORIGIN);
  if (!origin || env.TRUST_PROXY_HEADERS !== "1") {
    return { action: "reject", status: 503, message: "HTTPS 入口尚未完成配置" };
  }

  const method = request.method.toUpperCase();
  const safeMethod = method === "GET" || method === "HEAD";
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const host = request.headers.get("host")?.toLowerCase();
  const secure = forwardedProto === "https";
  const canonicalHost = host === origin.host.toLowerCase();

  if (secure && canonicalHost) return { action: "allow", production: true };
  if (safeMethod) {
    return { action: "redirect", status: 308, location: canonicalLocation(origin, new URL(request.url)) };
  }
  if (!secure) return { action: "reject", status: 426, message: "此操作仅允许通过 HTTPS 提交" };
  return { action: "reject", status: 421, message: "请求主机与正式入口不一致" };
}

export function assertSecureProductionTransport(request: TransportRequest, env: TransportEnvironment = process.env) {
  const decision = assessTransport(request, env);
  if (decision.action !== "allow") {
    const error = new Error(decision.action === "reject" ? decision.message : "此操作仅允许通过正式 HTTPS 入口提交") as Error & { status: number };
    error.status = decision.action === "reject" ? decision.status : 426;
    throw error;
  }
}
