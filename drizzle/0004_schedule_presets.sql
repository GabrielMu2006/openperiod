ALTER TABLE "semesters" ADD COLUMN "schedule_id" varchar(64);--> statement-breakpoint
ALTER TABLE "course_meetings" DROP CONSTRAINT "course_meetings_period_check";--> statement-breakpoint
ALTER TABLE "course_meetings" ADD CONSTRAINT "course_meetings_period_check" CHECK ("course_meetings"."start_period" between 1 and 16 and "course_meetings"."end_period" between "course_meetings"."start_period" and 16);--> statement-breakpoint
ALTER TABLE "busy_blocks" DROP CONSTRAINT "busy_blocks_period_check";--> statement-breakpoint
ALTER TABLE "busy_blocks" ADD CONSTRAINT "busy_blocks_period_check" CHECK ("busy_blocks"."start_period" between 1 and 16 and "busy_blocks"."end_period" between "busy_blocks"."start_period" and 16);
