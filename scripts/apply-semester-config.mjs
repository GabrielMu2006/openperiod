#!/usr/bin/env node
// 显式更新某所学校当前学期的开学日/周数（独立维护流程，读接口永远不会做这件事）。
// 用法：node --env-file=.env scripts/apply-semester-config.mjs <startDate> [weekCount] [timezone] [school]
// 例：  node --env-file=.env scripts/apply-semester-config.mjs 2026-09-07 16 Asia/Shanghai
//       node --env-file=.env scripts/apply-semester-config.mjs 2026-09-14 16 Asia/Shanghai uibe
// school 取学期行的 school 键：默认 PKU；其他学校用作息预设 id（如 uibe、zju、lzu-winter）。

import postgres from "postgres";

const DEFAULT_SEMESTER = {
  school: "PKU",
  academicYear: "2026–2027",
  semester: "秋季学期",
  timezone: "Asia/Shanghai",
};

const [startDate, weekCountArg, timezone, schoolArg] = process.argv.slice(2);
if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
  console.error("用法：node --env-file=.env scripts/apply-semester-config.mjs <startDate YYYY-MM-DD> [weekCount] [timezone] [school]");
  process.exit(1);
}
const weekCount = Number(weekCountArg ?? 16);
if (!Number.isInteger(weekCount) || weekCount < 1 || weekCount > 52) {
  console.error("weekCount 必须是 1-52 的整数");
  process.exit(1);
}
const school = schoolArg?.trim() || DEFAULT_SEMESTER.school;

if (!process.env.DATABASE_URL) {
  console.error("缺少 DATABASE_URL 环境变量");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL);
try {
  const [row] = await sql`
    insert into semesters (school, academic_year, semester, start_date, week_count, timezone, schedule_id)
    values (${school}, ${DEFAULT_SEMESTER.academicYear}, ${DEFAULT_SEMESTER.semester},
            ${startDate}, ${weekCount}, ${timezone ?? DEFAULT_SEMESTER.timezone},
            ${school === DEFAULT_SEMESTER.school ? null : school})
    on conflict (school, academic_year, semester) do update
      set start_date = ${startDate},
          week_count = ${weekCount},
          timezone = ${timezone ?? DEFAULT_SEMESTER.timezone}
    returning *`;
  console.log("学期配置已更新：", row);
} finally {
  await sql.end();
}
