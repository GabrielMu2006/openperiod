CREATE TYPE "public"."busy_kind" AS ENUM('ONE_TIME', 'RECURRING');--> statement-breakpoint
CREATE TYPE "public"."course_exception_type" AS ENUM('SKIP');--> statement-breakpoint
CREATE TYPE "public"."group_role" AS ENUM('OWNER', 'MEMBER');--> statement-breakpoint
CREATE TABLE "busy_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"semester_id" uuid NOT NULL,
	"kind" "busy_kind" NOT NULL,
	"title" varchar(200),
	"weekday" integer NOT NULL,
	"start_period" integer NOT NULL,
	"end_period" integer NOT NULL,
	"weeks" integer[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "busy_blocks_weekday_check" CHECK ("busy_blocks"."weekday" between 1 and 7),
	CONSTRAINT "busy_blocks_period_check" CHECK ("busy_blocks"."start_period" between 1 and 12 and "busy_blocks"."end_period" between "busy_blocks"."start_period" and 12)
);
--> statement-breakpoint
CREATE TABLE "course_exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_meeting_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"week" integer NOT NULL,
	"type" "course_exception_type" DEFAULT 'SKIP' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "course_exceptions_meeting_user_week_unique" UNIQUE("course_meeting_id","user_id","week"),
	CONSTRAINT "course_exceptions_week_check" CHECK ("course_exceptions"."week" between 1 and 52)
);
--> statement-breakpoint
CREATE TABLE "course_meetings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"weekday" integer NOT NULL,
	"start_period" integer NOT NULL,
	"end_period" integer NOT NULL,
	"weeks" integer[] NOT NULL,
	CONSTRAINT "course_meetings_weekday_check" CHECK ("course_meetings"."weekday" between 1 and 7),
	CONSTRAINT "course_meetings_period_check" CHECK ("course_meetings"."start_period" between 1 and 12 and "course_meetings"."end_period" between "course_meetings"."start_period" and 12)
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"semester_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"instructor" varchar(120),
	"location" varchar(200),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_members" (
	"group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "group_role" DEFAULT 'MEMBER' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_members_group_id_user_id_pk" PRIMARY KEY("group_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "group_privacy_overrides" (
	"group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"privacy_level" integer NOT NULL,
	CONSTRAINT "group_privacy_overrides_group_id_user_id_pk" PRIMARY KEY("group_id","user_id"),
	CONSTRAINT "group_privacy_level_check" CHECK ("group_privacy_overrides"."privacy_level" between 0 and 2)
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(80) NOT NULL,
	"invite_code" varchar(12) NOT NULL,
	"owner_id" uuid NOT NULL,
	"semester_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "groups_invite_code_unique" UNIQUE("invite_code")
);
--> statement-breakpoint
CREATE TABLE "semesters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school" varchar(32) NOT NULL,
	"academic_year" varchar(16) NOT NULL,
	"semester" varchar(32) NOT NULL,
	"start_date" date NOT NULL,
	"week_count" integer DEFAULT 16 NOT NULL,
	"timezone" varchar(64) DEFAULT 'Asia/Shanghai' NOT NULL,
	CONSTRAINT "semesters_school_year_term_unique" UNIQUE("school","academic_year","semester"),
	CONSTRAINT "semesters_week_count_check" CHECK ("semesters"."week_count" between 1 and 52)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token_hash" varchar(64) PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nickname" varchar(80) NOT NULL,
	"email" varchar(320) NOT NULL,
	"default_privacy_level" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_privacy_level_check" CHECK ("users"."default_privacy_level" between 0 and 2)
);
--> statement-breakpoint
ALTER TABLE "busy_blocks" ADD CONSTRAINT "busy_blocks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "busy_blocks" ADD CONSTRAINT "busy_blocks_semester_id_semesters_id_fk" FOREIGN KEY ("semester_id") REFERENCES "public"."semesters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_exceptions" ADD CONSTRAINT "course_exceptions_course_meeting_id_course_meetings_id_fk" FOREIGN KEY ("course_meeting_id") REFERENCES "public"."course_meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_exceptions" ADD CONSTRAINT "course_exceptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_meetings" ADD CONSTRAINT "course_meetings_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_semester_id_semesters_id_fk" FOREIGN KEY ("semester_id") REFERENCES "public"."semesters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_privacy_overrides" ADD CONSTRAINT "group_privacy_overrides_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_privacy_overrides" ADD CONSTRAINT "group_privacy_overrides_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_semester_id_semesters_id_fk" FOREIGN KEY ("semester_id") REFERENCES "public"."semesters"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "busy_blocks_user_semester_idx" ON "busy_blocks" USING btree ("user_id","semester_id");--> statement-breakpoint
CREATE INDEX "course_exceptions_user_week_idx" ON "course_exceptions" USING btree ("user_id","week");--> statement-breakpoint
CREATE INDEX "course_meetings_course_id_idx" ON "course_meetings" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "courses_user_semester_idx" ON "courses" USING btree ("user_id","semester_id");--> statement-breakpoint
CREATE INDEX "group_members_user_id_idx" ON "group_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "groups_owner_id_idx" ON "groups" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");