import type { Weekday } from "./schedule";

export type ImportFormat = "ROW" | "GRID";

export interface DetectionResult {
  supported: boolean;
  format: ImportFormat | null;
  confidence: number;
  reason: string;
}

export interface ImportMeetingDraft {
  id: string;
  weekday: Weekday;
  startPeriod: number;
  endPeriod: number;
  weeks: number[];
  source: string;
}

export interface ImportCourseDraft {
  id: string;
  name: string;
  instructor?: string;
  location?: string;
  meetings: ImportMeetingDraft[];
}

export type ImportWarningField = "weeks" | "meeting";

export interface ImportWarning {
  id: string;
  code: "MISSING_WEEKS" | "INVALID_ROW" | "AMBIGUOUS_CELL" | "UNSUPPORTED_VALUE";
  message: string;
  source: string;
  /** 关联到预览里的具体课程与字段，便于在检查页定位与标记解决 */
  courseId?: string;
  field?: ImportWarningField;
}

export interface ImportPreviewPayload {
  provider: "PKU_EXCEL" | "AI_EXTRACT";
  format: ImportFormat;
  /** 导入时选择的作息预设；缺省 = 北大默认 */
  scheduleId?: string;
  /** 作息快照（含自定义作息），客户端网格以此为准 */
  schedule?: { id: string; school: string; kind: "period" | "block"; rows: { period?: number; start: string; end: string; label?: string }[]; blocks?: { label: string; from: number; to: number }[] };
  courses: ImportCourseDraft[];
  warnings: ImportWarning[];
  stats: { courseCount: number; meetingCount: number; warningCount: number };
}

// 导入前自动快照：记录被替换的课表（含「本周不去」），允许在一定时间内一键恢复
export interface ImportSnapshotMeeting {
  weekday: number; // 1=周一 … 7=周日
  startPeriod: number;
  endPeriod: number;
  weeks: number[];
  skips: number[];
}

export interface ImportSnapshotCourse {
  name: string;
  instructor: string | null;
  location: string | null;
  meetings: ImportSnapshotMeeting[];
}

export interface ImportSnapshotPayload {
  courses: ImportSnapshotCourse[];
}

export const IMPORT_SNAPSHOT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface TimetableImporter {
  provider: string;
  detect(file: ArrayBuffer): Promise<DetectionResult>;
  parse(file: ArrayBuffer): Promise<ImportPreviewPayload>;
}
