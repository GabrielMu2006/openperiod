import { describe, expect, it } from "vitest";
import { buildSignedDirectMailParams, percentEncodeRpc } from "./directmail";

describe("percentEncodeRpc", () => {
  it("encodes beyond encodeURIComponent per RFC3986", () => {
    expect(percentEncodeRpc("a b")).toBe("a%20b");
    expect(percentEncodeRpc("课隙")).toBe("%E8%AF%BE%E9%9A%99");
    expect(percentEncodeRpc("!*()'")).toBe("%21%2A%28%29%27");
  });
});

describe("buildSignedDirectMailParams", () => {
  const credentials = { accessKeyId: "testKeyId", accessKeySecret: "testSecret&", region: "cn-hangzhou" };
  const context = { now: new Date("2026-09-14T08:00:00.000Z"), nonce: "nonce-123" };

  it("includes protocol constants and normalizes the timestamp", () => {
    const params = buildSignedDirectMailParams({ ToAddress: "a@b.c" }, credentials, context);
    expect(params.Action).toBe("SingleSendMail");
    expect(params.Version).toBe("2015-11-23");
    expect(params.SignatureMethod).toBe("HMAC-SHA1");
    expect(params.Timestamp).toBe("2026-09-14T08:00:00Z");
    expect(params.ToAddress).toBe("a@b.c");
  });

  it("produces a deterministic base64 signature", () => {
    const first = buildSignedDirectMailParams({ Subject: "课隙验证码" }, credentials, context);
    const second = buildSignedDirectMailParams({ Subject: "课隙验证码" }, credentials, context);
    expect(first.Signature).toBe(second.Signature);
    expect(first.Signature).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
  });
});
