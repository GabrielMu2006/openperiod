import "server-only";
import type { z } from "zod";
import { errorResponse, HttpError } from "@/src/server/http";
import { assertSecureProductionTransport } from "@/src/server/security/transport";

export async function readAuthRequest<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  try {
    assertSecureProductionTransport(request);
  } catch (error) {
    if (error instanceof Error && "status" in error) throw new HttpError(Number(error.status), error.message);
    throw error;
  }
  const origin = request.headers.get("origin");
  // A reverse proxy may expose HTTPS while Next sees an internal HTTP URL.
  // Pin the public origin in that deployment instead of trusting forwarded headers.
  const requestUrl = new URL(request.url);
  // Next can construct request.url with its internal hostname (e.g. localhost).
  // Host is the browser's actual destination, unlike untrusted forwarding headers.
  const host = request.headers.get("host");
  const expectedOrigin = process.env.AUTH_ORIGIN
    ? new URL(process.env.AUTH_ORIGIN).origin
    : new URL(`${requestUrl.protocol}//${host || requestUrl.host}`).origin;
  if (request.headers.get("sec-fetch-site") === "cross-site" || (origin && origin !== expectedOrigin)) {
    throw new HttpError(403, "请从本站提交认证请求");
  }
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") {
    throw new HttpError(415, "请使用 JSON 提交请求");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "请求内容为空");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > 8192) { await reader.cancel(); throw new HttpError(413, "认证请求过大"); }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  const parsed = schema.safeParse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "认证信息无效");
  return parsed.data;
}

export function authErrorResponse(error: unknown) {
  if (error instanceof HttpError || error instanceof SyntaxError) return errorResponse(error);
  // Database exceptions can contain bound hashes and credentials. Never log their payload.
  console.error("Authentication operation failed");
  return Response.json({ error: "认证服务暂不可用，请稍后重试" }, { status: 503 });
}
