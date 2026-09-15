import { randomUUID } from "node:crypto";
import readExcelFile from "read-excel-file/node";
import * as SheetJS from "xlsx";
import { HttpError } from "@/src/server/http";
import type {
  DetectionResult,
  ImportCourseDraft,
  ImportPreviewPayload,
  ImportWarning,
  TimetableImporter,
} from "@/src/domain/import";
import type { Weekday } from "@/src/domain/schedule";
import { parseWeekRule, type WeekParseResult } from "@/src/domain/week-rules";
import { PKU_SCHEDULE, type SchedulePreset } from "@/src/config/school-schedules";

type CellValue = string | number | boolean | Date | null;
type SheetData = { sheet: string; data: CellValue[][] };

const weekdayAliases: Record<string, Weekday> = {
  "1": "monday", monday: "monday", mon: "monday", 周一: "monday", 星期一: "monday", 一: "monday",
  "2": "tuesday", tuesday: "tuesday", tue: "tuesday", 周二: "tuesday", 星期二: "tuesday", 二: "tuesday",
  "3": "wednesday", wednesday: "wednesday", wed: "wednesday", 周三: "wednesday", 星期三: "wednesday", 三: "wednesday",
  "4": "thursday", thursday: "thursday", thu: "thursday", 周四: "thursday", 星期四: "thursday", 四: "thursday",
  "5": "friday", friday: "friday", fri: "friday", 周五: "friday", 星期五: "friday", 五: "friday",
  "6": "saturday", saturday: "saturday", sat: "saturday", 周六: "saturday", 星期六: "saturday", 六: "saturday",
  "7": "sunday", sunday: "sunday", sun: "sunday", 周日: "sunday", 星期日: "sunday", 星期天: "sunday", 日: "sunday", 天: "sunday",
};

const headerAliases = {
  course: ["course", "课程", "课程名称", "课程名"],
  teacher: ["teacher", "教师", "老师", "任课教师"],
  location: ["location", "地点", "教室", "上课地点"],
  weekday: ["weekday", "星期", "周几", "上课星期"],
  startPeriod: ["startperiod", "开始节次", "起始节次", "开始节"],
  endPeriod: ["endperiod", "结束节次", "终止节次", "结束节"],
  period: ["period", "节次", "上课节次"],
  weeks: ["weeks", "周次", "上课周次"],
  block: ["block", "大节", "上课大节"],
  lessonCount: ["lessoncount", "节数", "课时", "上课节数"],
  timeRange: ["timerange", "时间", "时间段", "上课时间"],
} as const;

type HeaderKey = keyof typeof headerAliases;
type HeaderMap = Partial<Record<HeaderKey, number>>;

function normalizedHeader(value: string) {
  return value.toLowerCase().replace(/[\s_\-\/]/g, "");
}

function cellText(value: CellValue | undefined) {
  if (value === null || value === undefined || value instanceof Date) return "";
  return String(value).trim();
}

function columnName(index: number) {
  let current = index + 1;
  let result = "";
  while (current > 0) {
    current -= 1;
    result = String.fromCharCode(65 + (current % 26)) + result;
    current = Math.floor(current / 26);
  }
  return result;
}

function source(sheet: SheetData, row: number, column: number) {
  return `${sheet.sheet} / ${columnName(column)}${row + 1}`;
}

function parseWeekday(value: string): Weekday | null {
  return weekdayAliases[value.trim().toLowerCase()] ?? null;
}

function parsePeriodRange(value: string, maxPeriod: number): [number, number] | null {
  const numbers = [...value.matchAll(/\d{1,2}/g)].map((match) => Number(match[0]));
  if (!numbers.length) return null;
  const start = numbers[0];
  const end = numbers[1] ?? start;
  if (start < 1 || end > maxPeriod || end < start) return null;
  return [start, end];
}

// 大节号：支持「二」「2」「第2大节」「第二大节」等写法
const chineseBlockDigits: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };

function parseBlockNumber(value: string): number | null {
  const match = value.match(/\d{1,2}/);
  if (match) {
    const block = Number(match[0]);
    return block >= 1 && block <= 12 ? block : null;
  }
  const cleaned = value.replace(/第|大|节|[\s,，、]/g, "");
  if (cleaned.length === 1) return chineseBlockDigits[cleaned] ?? null;
  if (cleaned === "十") return 10;
  if (cleaned.length === 2 && cleaned[0] === "十") {
    const rest = chineseBlockDigits[cleaned[1]];
    return rest ? 10 + rest : null;
  }
  if (cleaned.length === 3 && cleaned[1] === "十") {
    const tens = chineseBlockDigits[cleaned[0]];
    const rest = chineseBlockDigits[cleaned[2]];
    return tens && rest ? tens * 10 + rest : null;
  }
  return null;
}

// 「08:00–09:30」「9:50~11:20」等时间区间
export function parseClockRange(value: string): { startMin: number; endMin: number } | null {
  const numbers = [...value.matchAll(/(\d{1,2}):(\d{2})/g)].map((match) => Number(match[1]) * 60 + Number(match[2]));
  if (numbers.length < 2) return null;
  const [startMin, endMin] = numbers;
  if (endMin <= startMin || startMin < 0 || endMin > 24 * 60) return null;
  return { startMin, endMin };
}

function rowStartMin(row: { start: string; end: string }) {
  return toMinutes(row.start);
}

function toMinutes(hhmm: string) {
  const [hours, minutes] = hhmm.split(":").map(Number);
  return hours * 60 + minutes;
}

// 把钟点区间匹配到预设网格：起止各允许 ±20 分钟的容差
export function clockRangeToPeriods(
  range: { startMin: number; endMin: number },
  preset: SchedulePreset,
  toleranceMinutes = 20,
): [number, number] | null {
  let start: number | null = null;
  let end: number | null = null;
  for (const row of preset.rows) {
    if (start === null && Math.abs(rowStartMin(row) - range.startMin) <= toleranceMinutes) start = row.period;
    if (Math.abs(rowStartMin(row) + 45 - range.endMin) <= toleranceMinutes) end = row.period;
  }
  // 结束行兜底：找结束时刻最接近的行
  if (end === null) {
    let best = Infinity;
    for (const row of preset.rows) {
      const diff = Math.abs(rowStartMin(row) + 45 - range.endMin);
      if (diff < best) {
        best = diff;
        end = row.period;
      }
    }
  }
  if (start === null || end === null || end < start) return null;
  return [start, end];
}

function mapHasPeriodColumns(map: HeaderMap) {
  return map.period !== undefined || (map.startPeriod !== undefined && map.endPeriod !== undefined);
}

function findRowHeader(sheet: SheetData, preset: SchedulePreset) {
  for (let rowIndex = 0; rowIndex < Math.min(20, sheet.data.length); rowIndex += 1) {
    const map: HeaderMap = {};
    sheet.data[rowIndex].forEach((value, column) => {
      const header = normalizedHeader(cellText(value));
      for (const [key, aliases] of Object.entries(headerAliases) as [HeaderKey, readonly string[]][]) {
        if (aliases.some((alias) => normalizedHeader(alias) === header)) map[key] = column;
      }
    });
    const byPeriod = map.period !== undefined || (map.startPeriod !== undefined && map.endPeriod !== undefined);
    const byBlock = map.block !== undefined;
    const byTime = map.timeRange !== undefined;
    if (map.course !== undefined && map.weekday !== undefined && (byPeriod || byBlock || byTime)) {
      return { rowIndex, map };
    }
  }
  return null;
}

function findGridHeader(sheet: SheetData) {
  for (let rowIndex = 0; rowIndex < Math.min(20, sheet.data.length); rowIndex += 1) {
    const columns = new Map<number, Weekday>();
    sheet.data[rowIndex].forEach((value, column) => {
      const weekday = parseWeekday(cellText(value));
      if (weekday) columns.set(column, weekday);
    });
    if (columns.size >= 5) return { rowIndex, columns };
  }
  return null;
}

function finalize(format: "ROW" | "GRID", courses: ImportCourseDraft[], warnings: ImportWarning[]): ImportPreviewPayload {
  return {
    provider: "PKU_EXCEL",
    format,
    courses,
    warnings,
    stats: {
      courseCount: courses.length,
      meetingCount: courses.reduce((sum, course) => sum + course.meetings.length, 0),
      warningCount: warnings.length,
    },
  };
}

function parseRowSheet(sheet: SheetData, header: NonNullable<ReturnType<typeof findRowHeader>>, preset: SchedulePreset) {
  const maxPeriod = preset.rows.length;
  const coursesByKey = new Map<string, ImportCourseDraft>();
  const warnings: ImportWarning[] = [];
  for (let rowIndex = header.rowIndex + 1; rowIndex < sheet.data.length; rowIndex += 1) {
    const row = sheet.data[rowIndex];
    const name = cellText(row[header.map.course!]);
    if (!name) continue;
    const rowSource = source(sheet, rowIndex, header.map.course!);
    const weekday = parseWeekday(cellText(row[header.map.weekday!]));
    let period: [number, number] | null = null;
    if (header.map.timeRange !== undefined && header.map.block === undefined && mapHasPeriodColumns(header.map) === false) {
      // 时钟时间模式：任意学校的「时间」列（09:50-11:20）换算成节次
      const range = parseClockRange(cellText(row[header.map.timeRange]));
      period = range ? clockRangeToPeriods(range, preset) : null;
      if (!period) {
        warnings.push({ id: randomUUID(), code: "INVALID_ROW", message: `无法把“${name}”的上课时间匹配到作息网格，已跳过`, source: rowSource });
        continue;
      }
    } else if (header.map.block !== undefined) {
      // 大节制（如对外经贸）：大节号 + 节数（缺省 2）→ 展开为小节区间
      const blockNumber = parseBlockNumber(cellText(row[header.map.block]));
      const block = blockNumber !== null ? preset.blocks?.[blockNumber - 1] : undefined;
      if (!block) {
        warnings.push({ id: randomUUID(), code: "INVALID_ROW", message: `无法确认“${name}”的大节（应在第 1–${preset.blocks?.length ?? 0} 大节之间），已跳过`, source: rowSource });
        continue;
      }
      const lessonCount = header.map.lessonCount !== undefined ? Number(cellText(row[header.map.lessonCount])) || 2 : 2;
      const span = lessonCount === 3 ? 3 : 2;
      period = [block.from, Math.min(block.from + span - 1, block.to)];
    } else if (header.map.period !== undefined) {
      period = parsePeriodRange(cellText(row[header.map.period]), maxPeriod);
    } else {
      period = parsePeriodRange(`${cellText(row[header.map.startPeriod!])}-${cellText(row[header.map.endPeriod!])}`, maxPeriod);
    }
    const weekResult = parseWeekRule(header.map.weeks !== undefined ? cellText(row[header.map.weeks]) : "");
    if (!weekday || !period) {
      warnings.push({ id: randomUUID(), code: "INVALID_ROW", message: `无法确认“${name}”的星期或节次，已跳过`, source: rowSource });
      continue;
    }

    const instructor = header.map.teacher !== undefined ? cellText(row[header.map.teacher]) : "";
    const location = header.map.location !== undefined ? cellText(row[header.map.location]) : "";
    const key = [name, instructor, location].join("\u0000");
    const course = coursesByKey.get(key) ?? { id: randomUUID(), name, instructor: instructor || undefined, location: location || undefined, meetings: [] };
    if (!weekResult.recognized) {
      warnings.push({ id: randomUUID(), code: "MISSING_WEEKS", message: `无法确认“${name}”的周次，暂按 1–16 周处理`, source: rowSource, courseId: course.id, field: "weeks" });
    }
    course.meetings.push({ id: randomUUID(), weekday, startPeriod: period[0], endPeriod: period[1], weeks: weekResult.weeks, source: rowSource });
    coursesByKey.set(key, course);
  }
  return finalize("ROW", [...coursesByKey.values()], warnings);
}

function parseGridSheet(sheet: SheetData, header: NonNullable<ReturnType<typeof findGridHeader>>, preset: SchedulePreset) {
  const coursesByKey = new Map<string, ImportCourseDraft>();
  const warnings: ImportWarning[] = [];
  const firstDayColumn = Math.min(...header.columns.keys());
  for (let rowIndex = header.rowIndex + 1; rowIndex < sheet.data.length; rowIndex += 1) {
    const row = sheet.data[rowIndex];
    const maxPeriod = preset.rows.length;
    const periodLabel = row.slice(0, firstDayColumn).map(cellText).find((value) => parsePeriodRange(value, maxPeriod));
    const fallback = Math.min(maxPeriod, rowIndex - header.rowIndex);
    const period = periodLabel ? parsePeriodRange(periodLabel, maxPeriod)! : [fallback, fallback] as [number, number];
    for (const [column, weekday] of header.columns) {
      const text = cellText(row[column]);
      if (!text) continue;
      const cellSource = source(sheet, rowIndex, column);
      for (const entry of parseGridCell(text)) {
        const weeks = resolveGridWeeks(entry);
        const key = [entry.name, entry.location ?? ""].join("\u0000");
        const course = coursesByKey.get(key) ?? { id: randomUUID(), name: entry.name, location: entry.location, meetings: [] };
        if (!weeks.recognized) {
          warnings.push({ id: randomUUID(), code: "MISSING_WEEKS", message: `无法确认“${entry.name}”的周次，暂按 1–16 周处理`, source: cellSource, courseId: course.id, field: "weeks" });
        }
        const extendable = course.meetings.find((meeting) =>
          meeting.weekday === weekday && meeting.endPeriod === period[0] - 1 && meeting.weeks.join(",") === weeks.weeks.join(","));
        if (extendable) {
          extendable.endPeriod = period[1];
        } else {
          course.meetings.push({ id: randomUUID(), weekday, startPeriod: period[0], endPeriod: period[1], weeks: weeks.weeks, source: cellSource });
        }
        coursesByKey.set(key, course);
      }
    }
  }
  return finalize("GRID", [...coursesByKey.values()], warnings);
}

// 北大教务系统导出的网格单元格形如：
//   "课程名(地点)(备注：…) 每周考试方式：…" — 周次信号是「每周/单周/双周考试」
// 其他网格格式则常见「课程名 换行 1-16周」或整格即周次注记。
const PKU_EXAM_WEEK_PATTERN = /(每周|单周|双周)\s*考试/;
const WEEK_ANNOTATION_PATTERN = /^(?:第)?[\d\s,，、\-–—~～/]+周?$/;
const FIRST_PAREN_PATTERN = /[（(]([^（）()]*)[)）]/;

interface GridCellEntry {
  name: string;
  location?: string;
  weekText: string;
}

function parseGridCell(text: string): GridCellEntry[] {
  const entries: GridCellEntry[] = [];
  for (const rawLine of text.split(/[\r\n]+/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (entries.length && (WEEK_ANNOTATION_PATTERN.test(line) || /^(每周|单周|双周)$/.test(line))) {
      entries[entries.length - 1].weekText = line;
      continue;
    }
    const paren = line.match(FIRST_PAREN_PATTERN);
    const name = (paren?.index !== undefined ? line.slice(0, paren.index) : line).replace(/[\s,，、;；]+$/, "").trim();
    entries.push({ name: name || line, location: paren?.[1]?.trim() || undefined, weekText: line });
  }
  return entries;
}

function resolveGridWeeks(entry: GridCellEntry): WeekParseResult {
  const pku = entry.weekText.match(PKU_EXAM_WEEK_PATTERN);
  if (pku) {
    return pku[1] === "每周"
      ? { weeks: Array.from({ length: 16 }, (_, index) => index + 1), recognized: true }
      : parseWeekRule(pku[1]);
  }
  return parseWeekRule(entry.weekText);
}

export function parseWorkbookSheets(sheets: SheetData[], preset: SchedulePreset = PKU_SCHEDULE): ImportPreviewPayload {
  let recognizedStructure = false;
  for (const sheet of sheets) {
    const header = findRowHeader(sheet, preset);
    if (header) {
      const result = parseRowSheet(sheet, header, preset);
      if (result.courses.length) return result;
      recognizedStructure = true;
    }
  }
  for (const sheet of sheets) {
    const header = findGridHeader(sheet);
    if (header) {
      const result = parseGridSheet(sheet, header, preset);
      if (result.courses.length) return result;
      recognizedStructure = true;
    }
  }
  if (recognizedStructure) throw new HttpError(422, "课表格式已识别，但没有读到课程行——请填写课程后再导入");
  throw new HttpError(422, "当前版本仅支持北京大学课表、课隙标准模板或对应学校的标准模板");
}

// OLE2 复合文档魔数：Excel 97-2003（.xls）文件头
const LEGACY_XLS_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

function isLegacyBinaryExcel(file: ArrayBuffer) {
  if (file.byteLength < LEGACY_XLS_MAGIC.length) return false;
  return LEGACY_XLS_MAGIC.compare(Buffer.from(file, 0, LEGACY_XLS_MAGIC.length)) === 0;
}

function readLegacyXls(file: ArrayBuffer): SheetData[] {
  const workbook = SheetJS.read(Buffer.from(file), { type: "buffer" });
  return workbook.SheetNames.map((name) => ({
    sheet: name,
    data: SheetJS.utils.sheet_to_json(workbook.Sheets[name], { header: 1, raw: true, defval: null }) as CellValue[][],
  }));
}

async function readSheets(file: ArrayBuffer): Promise<SheetData[]> {
  const sheets = isLegacyBinaryExcel(file) ? readLegacyXls(file) : await readExcelFile(Buffer.from(file));
  if (sheets.length > 10 || sheets.some((sheet) => sheet.data.length > 5000)) throw new HttpError(413, "Excel 内容过大，无法安全解析");
  return sheets as SheetData[];
}

export class PkuExcelImporter implements TimetableImporter {
  provider = "PKU_EXCEL";

  async detect(file: ArrayBuffer, preset: SchedulePreset = PKU_SCHEDULE): Promise<DetectionResult> {
    const sheets = await readSheets(file);
    if (sheets.some((sheet) => findRowHeader(sheet, preset))) return { supported: true, format: "ROW", confidence: 1, reason: "识别到标准行式课表字段" };
    if (sheets.some(findGridHeader)) return { supported: true, format: "GRID", confidence: 0.8, reason: "识别到星期课表网格" };
    return { supported: false, format: null, confidence: 0, reason: `未识别到课表内容：目前支持${preset.school}教务课表或课隙标准模板` };
  }

  async parse(file: ArrayBuffer, preset: SchedulePreset = PKU_SCHEDULE): Promise<ImportPreviewPayload> {
    return parseWorkbookSheets(await readSheets(file), preset);
  }
}
