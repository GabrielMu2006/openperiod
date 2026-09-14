import "server-only";
import { createHmac, randomUUID } from "node:crypto";
import { HttpError } from "@/src/server/http";

const DIRECTMAIL_ENDPOINT = "https://dm.aliyuncs.com/";

export function directMailConfigured() {
  return Boolean(
    process.env.DIRECTMAIL_ACCESS_KEY_ID &&
    process.env.DIRECTMAIL_ACCESS_KEY_SECRET &&
    process.env.DIRECTMAIL_ACCOUNT,
  );
}

// 阿里云 RPC 签名要求的 RFC3986 百分号编码（encodeURIComponent 之外还要转 ! ' ( ) *）
export function percentEncodeRpc(value: string) {
  return encodeURIComponent(value)
    .replace(/!/g, "%21")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")
    .replace(/\*/g, "%2A");
}

export function buildSignedDirectMailParams(
  businessParams: Record<string, string>,
  credentials: { accessKeyId: string; accessKeySecret: string; region?: string },
  context: { now: Date; nonce: string },
): Record<string, string> {
  const params: Record<string, string> = {
    AccessKeyId: credentials.accessKeyId,
    Action: "SingleSendMail",
    Format: "JSON",
    RegionId: credentials.region ?? "cn-hangzhou",
    SignatureMethod: "HMAC-SHA1",
    SignatureNonce: context.nonce,
    SignatureVersion: "1.0",
    Timestamp: context.now.toISOString().replace(/\.\d{3}Z$/, "Z"),
    Version: "2015-11-23",
    ...businessParams,
  };
  const canonical = Object.keys(params)
    .sort()
    .map((key) => `${percentEncodeRpc(key)}=${percentEncodeRpc(params[key])}`)
    .join("&");
  const stringToSign = `POST&${percentEncodeRpc("/")}&${percentEncodeRpc(canonical)}`;
  const signature = createHmac("sha1", `${credentials.accessKeySecret}&`).update(stringToSign).digest("base64");
  return { ...params, Signature: signature };
}

async function postDirectMail(params: Record<string, string>) {
  const response = await fetch(DIRECTMAIL_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const body = (await response.json().catch(() => ({}))) as { Code?: string; Message?: string };
  if (!response.ok || body.Code) {
    throw new HttpError(502, `验证码邮件发送失败：${body.Message ?? body.Code ?? `HTTP ${response.status}`}`);
  }
}

export async function sendVerificationMail(to: string, code: string) {
  const accessKeyId = process.env.DIRECTMAIL_ACCESS_KEY_ID;
  const accessKeySecret = process.env.DIRECTMAIL_ACCESS_KEY_SECRET;
  const account = process.env.DIRECTMAIL_ACCOUNT;
  if (!accessKeyId || !accessKeySecret || !account) throw new Error("DirectMail is not configured");

  const params = buildSignedDirectMailParams(
    {
      AccountName: account,
      AddressType: "1",
      FromAlias: process.env.DIRECTMAIL_FROM_ALIAS ?? "课隙",
      ReplyToAddress: "false",
      HtmlBody: `<div style="font-family:PingFang SC,Microsoft YaHei,sans-serif;max-width:420px;margin:0 auto;padding:28px;border:1px solid #e6e0db;border-radius:14px;"><h2 style="margin:0 0 12px;color:#94070a;">课隙 OpenPeriod</h2><p style="margin:0 0 18px;color:#6e6565;font-size:14px;">你的登录验证码：</p><p style="margin:0 0 18px;font-size:30px;letter-spacing:8px;font-weight:700;color:#201b1b;">${code}</p><p style="margin:0;color:#968d8d;font-size:12px;">15 分钟内有效。如果不是你本人操作，请忽略这封邮件。</p></div>`,
      Subject: "课隙登录验证码",
      TextBody: `你的课隙验证码是 ${code}，15 分钟内有效。如果不是你本人操作，请忽略这封邮件。`,
      ToAddress: to,
    },
    { accessKeyId, accessKeySecret, region: process.env.DIRECTMAIL_REGION },
    { now: new Date(), nonce: randomUUID() },
  );
  await postDirectMail(params);
}
