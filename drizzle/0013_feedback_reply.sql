-- 反馈回访（FB-02）：管理员「标为已处理」时可附一句回复；提交者下次进站会看到
-- 「反馈已处理 + 回复」的横幅，点「知道了」后写入 acknowledged_at 不再显示（匿名反馈无法回访）。
ALTER TABLE "feedback" ADD COLUMN "reply" text;
ALTER TABLE "feedback" ADD COLUMN "handled_at" timestamp with time zone;
ALTER TABLE "feedback" ADD COLUMN "acknowledged_at" timestamp with time zone;
