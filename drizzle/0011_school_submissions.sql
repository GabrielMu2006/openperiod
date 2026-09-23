-- 学校候选提交池（SCH-03）：自定义学校向导收集「学校名称 + 逐节作息时间」，
-- 供项目所有者在管理后台人工审核；收录发版后可对提交者执行「完成迁移」。
CREATE TABLE IF NOT EXISTS "school_submissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "school_name" varchar(80) NOT NULL,
  "schedule_rows" jsonb NOT NULL,
  "status" varchar(16) DEFAULT 'pending' NOT NULL,
  "review_note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "school_submissions_status_check" CHECK ("status" in ('pending', 'approved', 'rejected', 'released'))
);
CREATE INDEX IF NOT EXISTS "school_submissions_user_id_idx" ON "school_submissions" ("user_id");
CREATE INDEX IF NOT EXISTS "school_submissions_status_idx" ON "school_submissions" ("status");
