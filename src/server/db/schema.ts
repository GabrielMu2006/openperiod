import {
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { ImportPreviewPayload } from "@/src/domain/import";

export const groupRole = pgEnum("group_role", ["OWNER", "MEMBER"]);
export const exceptionType = pgEnum("course_exception_type", ["SKIP"]);
export const busyKind = pgEnum("busy_kind", ["ONE_TIME", "RECURRING"]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    nickname: varchar("nickname", { length: 80 }).notNull(),
    email: varchar("email", { length: 320 }).notNull(),
    defaultPrivacyLevel: integer("default_privacy_level").notNull().default(1),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("users_email_unique").on(table.email),
    check("users_privacy_level_check", sql`${table.defaultPrivacyLevel} between 0 and 2`),
  ],
);

export const emailVerificationCodes = pgTable(
  "email_verification_codes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    codeHash: varchar("code_hash", { length: 64 }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("email_verification_codes_user_id_idx").on(table.userId),
    index("email_verification_codes_expires_at_idx").on(table.expiresAt),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    tokenHash: varchar("token_hash", { length: 64 }).primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("sessions_user_id_idx").on(table.userId), index("sessions_expires_at_idx").on(table.expiresAt)],
);

export const semesters = pgTable(
  "semesters",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    school: varchar("school", { length: 32 }).notNull(),
    academicYear: varchar("academic_year", { length: 16 }).notNull(),
    semester: varchar("semester", { length: 32 }).notNull(),
    startDate: date("start_date", { mode: "string" }).notNull(),
    weekCount: integer("week_count").notNull().default(16),
    timezone: varchar("timezone", { length: 64 }).notNull().default("Asia/Shanghai"),
  },
  (table) => [
    unique("semesters_school_year_term_unique").on(table.school, table.academicYear, table.semester),
    check("semesters_week_count_check", sql`${table.weekCount} between 1 and 52`),
  ],
);

export const groups = pgTable(
  "groups",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 80 }).notNull(),
    inviteCode: varchar("invite_code", { length: 12 }).notNull(),
    ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    semesterId: uuid("semester_id").notNull().references(() => semesters.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("groups_invite_code_unique").on(table.inviteCode), index("groups_owner_id_idx").on(table.ownerId)],
);

export const groupMembers = pgTable(
  "group_members",
  {
    groupId: uuid("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: groupRole("role").notNull().default("MEMBER"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.groupId, table.userId] }),
    index("group_members_user_id_idx").on(table.userId),
  ],
);

export const groupPrivacyOverrides = pgTable(
  "group_privacy_overrides",
  {
    groupId: uuid("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    privacyLevel: integer("privacy_level").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.groupId, table.userId] }),
    check("group_privacy_level_check", sql`${table.privacyLevel} between 0 and 2`),
  ],
);

export const courses = pgTable(
  "courses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    semesterId: uuid("semester_id").notNull().references(() => semesters.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    instructor: varchar("instructor", { length: 120 }),
    location: varchar("location", { length: 200 }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("courses_user_semester_idx").on(table.userId, table.semesterId),
  ],
);

export const courseMeetings = pgTable(
  "course_meetings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    courseId: uuid("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
    weekday: integer("weekday").notNull(),
    startPeriod: integer("start_period").notNull(),
    endPeriod: integer("end_period").notNull(),
    weeks: integer("weeks").array().notNull(),
  },
  (table) => [
    index("course_meetings_course_id_idx").on(table.courseId),
    check("course_meetings_weekday_check", sql`${table.weekday} between 1 and 7`),
    check("course_meetings_period_check", sql`${table.startPeriod} between 1 and 12 and ${table.endPeriod} between ${table.startPeriod} and 12`),
  ],
);

export const courseExceptions = pgTable(
  "course_exceptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    courseMeetingId: uuid("course_meeting_id").notNull().references(() => courseMeetings.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    week: integer("week").notNull(),
    type: exceptionType("type").notNull().default("SKIP"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("course_exceptions_meeting_user_week_unique").on(table.courseMeetingId, table.userId, table.week),
    index("course_exceptions_user_week_idx").on(table.userId, table.week),
    check("course_exceptions_week_check", sql`${table.week} between 1 and 52`),
  ],
);

export const busyBlocks = pgTable(
  "busy_blocks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    semesterId: uuid("semester_id").notNull().references(() => semesters.id, { onDelete: "cascade" }),
    kind: busyKind("kind").notNull(),
    title: varchar("title", { length: 200 }),
    weekday: integer("weekday").notNull(),
    startPeriod: integer("start_period").notNull(),
    endPeriod: integer("end_period").notNull(),
    weeks: integer("weeks").array().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("busy_blocks_user_semester_idx").on(table.userId, table.semesterId),
    check("busy_blocks_weekday_check", sql`${table.weekday} between 1 and 7`),
    check("busy_blocks_period_check", sql`${table.startPeriod} between 1 and 12 and ${table.endPeriod} between ${table.startPeriod} and 12`),
  ],
);

export const importPreviews = pgTable(
  "import_previews",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    semesterId: uuid("semester_id").notNull().references(() => semesters.id, { onDelete: "cascade" }),
    payload: jsonb("payload").$type<ImportPreviewPayload>().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("import_previews_user_id_idx").on(table.userId),
    index("import_previews_expires_at_idx").on(table.expiresAt),
  ],
);

export type UserRow = typeof users.$inferSelect;
