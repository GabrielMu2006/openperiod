#!/usr/bin/env node
// 显式更新当前学期的开学日/周数（独立维护流程，读接口永远不会做这件事）。
// 用法：node --env-file=.env scripts/apply-semester-config.mjs <startDate> [weekCount] [timezone]
// 例：  node --env-file=.env scripts/apply-semester-config.mjs 2026-09-07 16 Asia/Shanghai

import postgres from "postgres";

const DEFAULT_SEMESTER = {
  school: "PKU",
  academicYear: "2026–2027",
  semester: "秋季学期",
  timezone: "Asia/Shanghai",
};

const [startDate, weekCountArg, timezone] = process.argv.slice(2);
if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
  console.error("用法：node --env-file=.env scripts/apply-semester-config.mjs <startDate YYYY-MM-DD> [weekCount] [timezone]");
  process.exit(1);
}
const weekCount = Number(weekCountArg ?? 16);
if (!Number.isInteger(weekCount) || weekCount < 1 || weekCount > 52) {
  console.error("weekCount 必须是 1-52 的整数");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("缺少 DATABASE_URL 环境变量");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL);
try {
  const [row] = await sql`
    insert into semesters (school, academic_year, semester, start_date, week_count, timezone)
    values (${DEFAULT_SEMESTER.school}, ${DEFAULT_SEMESTER.academicYear}, ${DEFAULT_SEMESTER.semester},
            ${startDate}, ${weekCount}, ${timezone ?? DEFAULT_SEMESTER.timezone})
    on conflict (school, academic_year, semester) do update
      set start_date = ${startDate},
          week_count = ${weekCount},
          timezone = ${timezone ?? DEFAULT_SEMESTER.timezone}
    returning *`;
  console.log("学期配置已更新：", row);
} finally {
  await sql.end();
}
