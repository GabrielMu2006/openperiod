import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import nextConfig from "@/next.config";
import { config, handleTransportRequest } from "@/proxy";
import { assessTransport } from "./transport";

const production = {
  NODE_ENV: "production",
  AUTH_ORIGIN: "https://period.example",
  TRUST_PROXY_HEADERS: "1",
};

function request(url: string, method = "GET", headers: Record<string, string> = {}) {
  return new NextRequest(url, { method, headers });
}

describe("production HTTPS boundary", () => {
  it("keeps local development available over HTTP", () => {
    expect(assessTransport(request("http://localhost/login"), { NODE_ENV: "development" })).toEqual({ action: "allow", production: false });
  });

  it.each([
    [{ NODE_ENV: "production", TRUST_PROXY_HEADERS: "1" }, "missing origin"],
    [{ NODE_ENV: "production", AUTH_ORIGIN: "http://period.example", TRUST_PROXY_HEADERS: "1" }, "HTTP origin"],
    [{ NODE_ENV: "production", AUTH_ORIGIN: "https://period.example/path", TRUST_PROXY_HEADERS: "1" }, "origin with path"],
    [{ NODE_ENV: "production", AUTH_ORIGIN: "https://period.example" }, "untrusted proxy"],
  ])("fails closed for %s (%s)", (env, _description) => {
    expect(assessTransport(request("http://internal/login"), env)).toMatchObject({ action: "reject", status: 503 });
  });

  it("allows only an exact HTTPS proxy marker and canonical Host", () => {
    const allowed = request("http://internal/login", "GET", { host: "period.example", "x-forwarded-proto": "https" });
    expect(assessTransport(allowed, production)).toEqual({ action: "allow", production: true });
    for (const value of ["http", "https,http", "HTTPS", "ftp"]) {
      const spoofed = request("http://internal/login", "POST", { host: "period.example", "x-forwarded-proto": value });
      expect(assessTransport(spoofed, production)).toMatchObject({ action: "reject", status: 426 });
    }
  });

  it("redirects safe requests without allowing the path to replace the canonical host", () => {
    const response = handleTransportRequest(
      request("http://internal//attacker.example/path?next=https://attacker.example", "GET", { host: "old.example", "x-forwarded-proto": "http" }),
      production,
    );
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("https://period.example//attacker.example/path?next=https://attacker.example");
  });

  it("never redirects non-idempotent HTTP or wrong-host requests", async () => {
    const insecure = handleTransportRequest(
      request("http://internal/api/auth/login", "POST", { host: "period.example", "x-forwarded-proto": "http" }), production,
    );
    expect(insecure.status).toBe(426);
    expect(insecure.headers.get("location")).toBeNull();
    const wrongHost = handleTransportRequest(
      request("http://internal/api/auth/login", "POST", { host: "attacker.example", "x-forwarded-proto": "https" }), production,
    );
    expect(wrongHost.status).toBe(421);
    expect(wrongHost.headers.get("location")).toBeNull();
  });

  it("adds transport headers to allowed production responses", () => {
    const response = handleTransportRequest(
      request("http://internal/login", "GET", { host: "period.example", "x-forwarded-proto": "https" }), production,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("strict-transport-security")).toBe("max-age=31536000");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("matches pages, APIs and static assets so the boundary has no route alias", () => {
    for (const url of ["/", "/login", "/api/auth/login", "/_next/static/test.js", "/favicon.ico"]) {
      // Next 16 docs call this unstable_doesProxyMatch, while the installed
      // testing package still exports its compatibility name.
      expect(unstable_doesMiddlewareMatch({ config, nextConfig, url })).toBe(true);
    }
  });
});
