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

export interface ImportWarning {
  id: string;
  code: "MISSING_WEEKS" | "INVALID_ROW" | "AMBIGUOUS_CELL" | "UNSUPPORTED_VALUE";
  message: string;
  source: string;
}

export interface ImportPreviewPayload {
  provider: "PKU_EXCEL";
  format: ImportFormat;
  courses: ImportCourseDraft[];
  warnings: ImportWarning[];
  stats: { courseCount: number; meetingCount: number; warningCount: number };
}

export interface TimetableImporter {
  provider: string;
  detect(file: ArrayBuffer): Promise<DetectionResult>;
  parse(file: ArrayBuffer): Promise<ImportPreviewPayload>;
}
