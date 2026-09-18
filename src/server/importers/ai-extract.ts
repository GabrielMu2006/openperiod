import "server-only";
import { randomUUID } from "node:crypto";
import { clockRangeToPeriods, parseClockRange } from "@/src/server/importers/pku-excel";
import type { SchedulePreset } from "@/src/config/school-schedules";
import type { ImportCourseDraft, ImportWarning } from "@/src/domain/import";
import type { Weekday } from "@/src/domain/schedule";
import { parseWeekRule } from "@/src/domain/week-rules";

// AI 课表识别：调用智谱免费模型（GLM-4V-Flash 看图 / GLM-4-Flash 读文字），
// 把截图或复制来的课表文字转成结构化课程草稿，交给标准导入预览流程核对。
// Key 只在服务端使用（ZHIPU_API_KEY）；模型输出不可信，逐条校验后再进预览。

const ZHIPU_API_URL = "https://open.bigmodel.cn/api/paas/v4/chat/completions";
const TEXT_MODEL = "glm-4-flash";
const VISION_MODEL = "glm-4v-flash";
const REQUEST_TIMEOUT_MS = 60_000;

const weekdayByNumber: Record<number, Weekday> = {
  1: "monday", 2: "tuesday", 3: "wednesday", 4: "thursday",
  5: "friday", 6: "saturday", 7: "sunday",
};

const weekdayLabels: Record<Weekday, string> = {
  monday: "一", tuesday: "二", wednesday: "三", thursday: "四",
  friday: "五", saturday: "六", sunday: "日",
};

const EXTRACT_PROMPT = `从课表图片/文字提取课程。只输出 JSON，禁止任何其他文字、禁止 markdown 代码块。第一字符必须是 {，最后字符必须是 }。
必须严格遵循此结构（courses 是数组，每条是一个上课时段）：
{"courses":[{"name":"课程名","teacher":"","location":"地点","day":1,"periods":"3-4","time":"10:10-12:00","weeks":"1-16"}]}
字段规则：
- day: 数字 1=周一 2=周二 3=周三 4=周四 5=周五 6=周六 7=周日，从课表表头列判断
- periods: 节次号如 "3-4"；若课表只写了时间没写节次，填 ""
- time: 起止时间如 "10:10-12:00"
- weeks: 周次如 "1-16"、"单周"、"双周"、"1,3,5"；没写就填 "1-16"
- teacher / location：没有就填空字符串
- 同一门课出现多个时段就输出多条，name 相同
示例输出：{"courses":[{"name":"高等数学","teacher":"","location":"二教101","day":1,"periods":"3-4","time":"10:10-12:00","weeks":"1-16"}]}`;

interface AiCourseRecord {
  name?: string;
  teacher?: string;
  location?: string;
  day?: number | string;
  periods?: string;
  time?: string;
  weeks?: string;
}

export class AiExtractError extends Error {}

function buildPayload(mode: "text" | "image", input: string) {
  if (mode === "image") {
    return {
      model: VISION_MODEL,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [{
        role: "user",
        content: [
          { type: "image_url", image_url: { url: input } },
          { type: "text", text: EXTRACT_PROMPT },
        ],
      }],
    };
  }
  return {
    model: TEXT_MODEL,
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: `${EXTRACT_PROMPT}\n\n课表内容：\n${input}` }],
  };
}

async function callZhipu(mode: "text" | "image", input: string) {
  const apiKey = process.env.ZHIPU_API_KEY;
  if (!apiKey) throw new AiExtractError("AI 识别未配置，请联系站点管理员");
  let response: Response;
  try {
    response = await fetch(ZHIPU_API_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(buildPayload(mode, input)),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (cause) {
    if (cause instanceof Error && cause.name === "TimeoutError") throw new AiExtractError("AI 识别超时，请稍后重试");
    throw new AiExtractError("无法连接 AI 识别服务，请稍后重试");
  }
  if (response.status === 401) throw new AiExtractError("AI 识别密钥无效，请联系站点管理员");
  if (response.status === 429) throw new AiExtractError("AI 识别当前限流，请稍后再试");
  if (!response.ok) throw new AiExtractError("AI 识别服务返回异常，请稍后重试");
  const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const content = body.choices?.[0]?.message?.content ?? "";
  if (!content.trim()) throw new AiExtractError("AI 没有识别出内容，请换一张更清晰的截图或补充文字");
  return content;
}

function parseModelJson(content: string): AiCourseRecord[] {
  // 模型偶发包一层 ```json 代码块或前后废话，取第一个 { 到最后一个 } 之间的部分
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start < 0 || end <= start) throw new AiExtractError("AI 返回了无法解析的结果，请重试一次");
  let parsed: unknown;
  try {
    parsed = JSON.parse(content.slice(start, end + 1));
  } catch {
    throw new AiExtractError("AI 返回了无法解析的结果，请重试一次");
  }
  const courses = (parsed as { courses?: unknown }).courses;
  if (!Array.isArray(courses)) throw new AiExtractError("AI 返回了无法解析的结果，请重试一次");
  return courses as AiCourseRecord[];
}

function normalizeDay(value: AiCourseRecord["day"]): number | null {
  const day = typeof value === "number" ? value : Number(String(value ?? "").match(/\d/)?.[0]);
  return Number.isInteger(day) && day >= 1 && day <= 7 ? day : null;
}

export async function extractCoursesWithAi(mode: "text" | "image", input: string, preset: SchedulePreset) {
  const content = await callZhipu(mode, input);
  const records = parseModelJson(content);
  const maxPeriod = preset.rows.length;
  const warnings: ImportWarning[] = [];
  const coursesByKey = new Map<string, ImportCourseDraft>();

  for (const [index, record] of records.entries()) {
    const source = `AI 识别 · 第 ${index + 1} 条`;
    const name = String(record.name ?? "").trim();
    const day = normalizeDay(record.day);
    if (!name || day === null) {
      warnings.push({ id: randomUUID(), code: "INVALID_ROW", message: "AI 识别到一条无法确认课程名或星期的记录，已跳过", source });
      continue;
    }
    const weekday = weekdayByNumber[day];

    let periods: [number, number] | null = null;
    const periodsText = String(record.periods ?? "").trim();
    if (periodsText) {
      const numbers = [...periodsText.matchAll(/\d{1,2}/g)].map((match) => Number(match[0]));
      const start = numbers[0];
      const end = numbers[1] ?? start;
      if (start !== undefined && start >= 1 && end <= maxPeriod && end >= start) periods = [start, end];
    }
    if (!periods) {
      const range = parseClockRange(String(record.time ?? ""));
      if (range) periods = clockRangeToPeriods(range, preset);
    }
    if (!periods) {
      warnings.push({ id: randomUUID(), code: "INVALID_ROW", message: `「${name}」的节次/时间无法对应到${preset.school}作息，已跳过`, source });
      continue;
    }

    const weekResult = parseWeekRule(String(record.weeks ?? "").trim());
    const weeks = weekResult.recognized ? weekResult.weeks : Array.from({ length: 16 }, (_, i) => i + 1);
    if (!weekResult.recognized) {
      warnings.push({ id: randomUUID(), code: "MISSING_WEEKS", message: `「${name}」的周次无法确认，暂按 1–16 周处理`, source });
    }

    const key = [name, String(record.teacher ?? ""), String(record.location ?? "")].join("\u0000");
    const course = coursesByKey.get(key) ?? {
      id: randomUUID(), name,
      instructor: String(record.teacher ?? "").trim() || undefined,
      location: String(record.location ?? "").trim() || undefined,
      meetings: [],
    };
    course.meetings.push({
      id: randomUUID(), weekday, startPeriod: periods[0], endPeriod: periods[1],
      weeks, source: `AI 识别（周${weekdayLabels[weekday]} 第${periods[0]}–${periods[1]}节）`,
    });
    coursesByKey.set(key, course);
  }

  const courses = [...coursesByKey.values()];
  if (!courses.length) throw new AiExtractError("AI 没有识别出可导入的课程，请换一张更清晰的截图或补充文字");
  return { courses, warnings };
}
