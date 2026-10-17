-- 用户级学期设置（USER-SEM）：开学日/周数按用户覆盖学校默认。
-- 学生反馈各校开学时间与周数不同；此前 semesters 表按学校共享，自定义学校的用户还共用同一行。
-- 只覆盖当前默认学年/学期；课表解析、导入周次校验、共同空闲换算统一读这份覆盖。
CREATE TABLE IF NOT EXISTS "user_semester_settings" (
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "academic_year" varchar(16) NOT NULL,
  "semester" varchar(32) NOT NULL,
  "start_date" date NOT NULL,
  "week_count" integer NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "user_semester_settings_user_term_unique" UNIQUE ("user_id", "academic_year", "semester"),
  CONSTRAINT "user_semester_settings_week_count_check" CHECK ("week_count" between 1 and 52)
);
