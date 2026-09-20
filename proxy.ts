import { NextResponse, type NextRequest } from "next/server";
import { assessTransport, type TransportEnvironment } from "@/src/server/security/transport";

const securityHeaders = {
  "Strict-Transport-Security": "max-age=31536000",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
} as const;

function withSecurityHeaders(response: NextResponse, production: boolean) {
  if (production) for (const [name, value] of Object.entries(securityHeaders)) response.headers.set(name, value);
  return response;
}

export function handleTransportRequest(request: NextRequest, env: TransportEnvironment) {
  const decision = assessTransport(request, env);
  if (decision.action === "redirect") {
    return withSecurityHeaders(NextResponse.redirect(decision.location, decision.status), true);
  }
  if (decision.action === "reject") {
    const response = NextResponse.json({ error: decision.message }, { status: decision.status });
    response.headers.set("Cache-Control", "no-store");
    return withSecurityHeaders(response, env.NODE_ENV === "production");
  }
  return withSecurityHeaders(NextResponse.next(), decision.production);
}

export function proxy(request: NextRequest) {
  return handleTransportRequest(request, process.env);
}

export const config = { matcher: "/:path*" };
