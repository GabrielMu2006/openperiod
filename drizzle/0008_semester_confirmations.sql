-- Additive schema only. Lets a member explicitly confirm "no courses this semester",
-- so availability can distinguish unrecorded (unknown) from confirmed-empty (AV-03).
CREATE TABLE "semester_confirmations" (
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "semester_id" uuid NOT NULL REFERENCES "semesters"("id") ON DELETE CASCADE,
  "confirmed_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "semester_confirmations_user_semester_pk" PRIMARY KEY ("user_id", "semester_id")
);
