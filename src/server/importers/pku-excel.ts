import { randomUUID } from "node:crypto";
import readExcelFile from "read-excel-file/node";
import type {
  DetectionResult,
  ImportCourseDraft,
  ImportPreviewPayload,
  ImportWarning,
  TimetableImporter,
} from "@/src/domain/import";
import type { Weekday } from "@/src/domain/schedule";
import { parseWeekRule } from "@/src/domain/week-rules";

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

function parsePeriodRange(value: string): [number, number] | null {
  const numbers = [...value.matchAll(/\d{1,2}/g)].map((match) => Number(match[0]));
  if (!numbers.length) return null;
  const start = numbers[0];
  const end = numbers[1] ?? start;
  if (start < 1 || end > 12 || end < start) return null;
  return [start, end];
}

function findRowHeader(sheet: SheetData) {
  for (let rowIndex = 0; rowIndex < Math.min(20, sheet.data.length); rowIndex += 1) {
    const map: HeaderMap = {};
    sheet.data[rowIndex].forEach((value, column) => {
      const header = normalizedHeader(cellText(value));
      for (const [key, aliases] of Object.entries(headerAliases) as [HeaderKey, readonly string[]][]) {
        if (aliases.some((alias) => normalizedHeader(alias) === header)) map[key] = column;
      }
    });
    if (map.course !== undefined && map.weekday !== undefined && (map.period !== undefined || (map.startPeriod !== undefined && map.endPeriod !== undefined))) {
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

function parseRowSheet(sheet: SheetData, header: NonNullable<ReturnType<typeof findRowHeader>>) {
  const coursesByKey = new Map<string, ImportCourseDraft>();
  const warnings: ImportWarning[] = [];
  for (let rowIndex = header.rowIndex + 1; rowIndex < sheet.data.length; rowIndex += 1) {
    const row = sheet.data[rowIndex];
    const name = cellText(row[header.map.course!]);
    if (!name) continue;
    const rowSource = source(sheet, rowIndex, header.map.course!);
    const weekday = parseWeekday(cellText(row[header.map.weekday!]));
    const period = header.map.period !== undefined
      ? parsePeriodRange(cellText(row[header.map.period]))
      : parsePeriodRange(`${cellText(row[header.map.startPeriod!])}-${cellText(row[header.map.endPeriod!])}`);
    const weekResult = parseWeekRule(header.map.weeks !== undefined ? cellText(row[header.map.weeks]) : "");
    if (!weekday || !period) {
      warnings.push({ id: randomUUID(), code: "INVALID_ROW", message: `无法确认“${name}”的星期或节次，已跳过`, source: rowSource });
      continue;
    }
    if (!weekResult.recognized) warnings.push({ id: randomUUID(), code: "MISSING_WEEKS", message: `无法确认“${name}”的周次，暂按 1–16 周处理`, source: rowSource });

    const instructor = header.map.teacher !== undefined ? cellText(row[header.map.teacher]) : "";
    const location = header.map.location !== undefined ? cellText(row[header.map.location]) : "";
    const key = [name, instructor, location].join("\u0000");
    const course = coursesByKey.get(key) ?? { id: randomUUID(), name, instructor: instructor || undefined, location: location || undefined, meetings: [] };
    course.meetings.push({ id: randomUUID(), weekday, startPeriod: period[0], endPeriod: period[1], weeks: weekResult.weeks, source: rowSource });
    coursesByKey.set(key, course);
  }
  return finalize("ROW", [...coursesByKey.values()], warnings);
}

function parseGridSheet(sheet: SheetData, header: NonNullable<ReturnType<typeof findGridHeader>>) {
  const courses: ImportCourseDraft[] = [];
  const warnings: ImportWarning[] = [];
  const firstDayColumn = Math.min(...header.columns.keys());
  for (let rowIndex = header.rowIndex + 1; rowIndex < sheet.data.length; rowIndex += 1) {
    const row = sheet.data[rowIndex];
    const periodLabel = row.slice(0, firstDayColumn).map(cellText).find((value) => parsePeriodRange(value));
    const fallback = Math.min(12, rowIndex - header.rowIndex);
    const period = periodLabel ? parsePeriodRange(periodLabel)! : [fallback, fallback] as [number, number];
    for (const [column, weekday] of header.columns) {
      const text = cellText(row[column]);
      if (!text) continue;
      const lines = text.split(/[\r\n]+/).map((line) => line.trim()).filter(Boolean);
      const name = lines[0];
      const weekValue = lines.find((line) => /周|单|双|ODD|EVEN|\d+\s*[-–—~～]\s*\d+/i.test(line)) ?? "";
      const weekResult = parseWeekRule(weekValue);
      const cellSource = source(sheet, rowIndex, column);
      if (!weekResult.recognized) warnings.push({ id: randomUUID(), code: "MISSING_WEEKS", message: `无法确认“${name}”的周次，暂按 1–16 周处理`, source: cellSource });
      courses.push({ id: randomUUID(), name, meetings: [{ id: randomUUID(), weekday, startPeriod: period[0], endPeriod: period[1], weeks: weekResult.weeks, source: cellSource }] });
    }
  }
  return finalize("GRID", courses, warnings);
}

export function parseWorkbookSheets(sheets: SheetData[]): ImportPreviewPayload {
  let recognizedStructure = false;
  for (const sheet of sheets) {
    const header = findRowHeader(sheet);
    if (header) {
      const result = parseRowSheet(sheet, header);
      if (result.courses.length) return result;
      recognizedStructure = true;
    }
  }
  for (const sheet of sheets) {
    const header = findGridHeader(sheet);
    if (header) {
      const result = parseGridSheet(sheet, header);
      if (result.courses.length) return result;
      recognizedStructure = true;
    }
  }
  if (recognizedStructure) throw new Error("课表格式已识别，但没有读到课程行——请填写课程后再导入");
  throw new Error("当前版本仅支持北京大学课表或课隙标准模板");
}

async function readSheets(file: ArrayBuffer): Promise<SheetData[]> {
  const sheets = await readExcelFile(Buffer.from(file));
  if (sheets.length > 10 || sheets.some((sheet) => sheet.data.length > 5000)) throw new Error("Excel 内容过大，无法安全解析");
  return sheets as SheetData[];
}

export class PkuExcelImporter implements TimetableImporter {
  provider = "PKU_EXCEL";

  async detect(file: ArrayBuffer): Promise<DetectionResult> {
    const sheets = await readSheets(file);
    if (sheets.some(findRowHeader)) return { supported: true, format: "ROW", confidence: 1, reason: "识别到标准行式课表字段" };
    if (sheets.some(findGridHeader)) return { supported: true, format: "GRID", confidence: 0.8, reason: "识别到星期课表网格" };
    return { supported: false, format: null, confidence: 0, reason: "未识别到 PKU 课表字段或星期网格" };
  }

  async parse(file: ArrayBuffer): Promise<ImportPreviewPayload> {
    return parseWorkbookSheets(await readSheets(file));
  }
}
