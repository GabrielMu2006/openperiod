-- Soft-archive groups without deleting the group, memberships, privacy choices,
-- courses, or historical availability data (GROUP-01).
ALTER TABLE "groups" ADD COLUMN "archived_at" timestamp with time zone;
