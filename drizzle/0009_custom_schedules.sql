-- Additive schema only. Per-user custom schedules replace the shared school='custom'
-- semester grid, so one user's edit no longer changes another user's schedule (SCH-01).
CREATE TABLE "custom_schedules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "academic_year" varchar(16) NOT NULL,
  "semester" varchar(32) NOT NULL,
  "schedule_rows" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "custom_schedules_user_term_unique" UNIQUE ("user_id", "academic_year", "semester")
);

-- Backfill: snapshot the legacy shared grid as each custom user's own schedule.
-- This preserves the current effective state for every existing user without
-- inferring intent; from now on each user's edits stay isolated.
INSERT INTO "custom_schedules" ("user_id", "academic_year", "semester", "schedule_rows")
SELECT u."id", s."academic_year", s."semester", s."custom_schedule"
FROM "users" u
JOIN "semesters" s ON s."school" = 'custom' AND s."custom_schedule" IS NOT NULL
WHERE u."schedule_id" = 'custom'
ON CONFLICT DO NOTHING;
