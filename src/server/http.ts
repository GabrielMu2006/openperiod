export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

export function errorResponse(error: unknown) {
  if (error instanceof HttpError) {
    return Response.json({ error: error.message }, { status: error.status });
  }

  if (error instanceof SyntaxError) {
    return Response.json({ error: "请求内容不是有效 JSON" }, { status: 400 });
  }

  console.error(error);
  const unavailable = error instanceof Error && error.message === "DATABASE_URL is not configured";
  return Response.json(
    { error: unavailable ? "数据库尚未配置" : "服务器暂时无法处理请求" },
    { status: unavailable ? 503 : 500 },
  );
}
