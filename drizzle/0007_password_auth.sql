-- Additive schema only. No users, courses, memberships or historical sessions are deleted.
-- On application cutover, legacy sessions with NULL auth_version no longer authenticate.
ALTER TABLE "users" ADD COLUMN "password_hash" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "auth_version" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "auth_version" integer;
--> statement-breakpoint
CREATE TABLE "password_challenges" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" varchar(320) NOT NULL,
  "purpose" varchar(32) NOT NULL,
  "code_hash" varchar(64) NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "consumed_at" timestamp with time zone,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "password_challenges_purpose_check" CHECK ("purpose" in ('REGISTER', 'SET_PASSWORD', 'RESET_PASSWORD'))
);
--> statement-breakpoint
CREATE INDEX "password_challenges_email_idx" ON "password_challenges" ("email");
--> statement-breakpoint
CREATE TABLE "auth_mail_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" varchar(320) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "auth_mail_events_email_created_idx" ON "auth_mail_events" ("email", "created_at");
--> statement-breakpoint
CREATE TABLE "auth_rate_limits" (
  "key" varchar(128) PRIMARY KEY NOT NULL,
  "count" integer NOT NULL,
  "reset_at" timestamp with time zone NOT NULL
);
