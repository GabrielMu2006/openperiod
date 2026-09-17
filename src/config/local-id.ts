// 客户端临时 ID 生成：crypto.randomUUID 只在安全上下文（https/localhost）可用，
// 线上 IP 直连（http）下不存在，必须降级。仅用于本地列表 key / 草稿 id，
// 服务端仍会生成正式 UUID。
export function localId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}
