export const WEEKDAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export type Weekday = (typeof WEEKDAYS)[number];
export type PrivacyLevel = 0 | 1 | 2;

export interface Semester {
  id: string;
  school: string;
  academicYear: string;
  semester: string;
  startDate: string;
  weekCount: number;
  timezone: string;
}

export interface User {
  id: string;
  nickname: string;
  email: string;
  defaultPrivacyLevel: PrivacyLevel;
}

export interface Course {
  id: string;
  userId: string;
  semesterId: string;
  name: string;
  instructor?: string;
  location?: string;
  notes?: string;
}

export interface CourseMeeting {
  id: string;
  courseId: string;
  weekday: Weekday;
  startPeriod: number;
  endPeriod: number;
  weeks: number[];
}

export interface CourseException {
  courseMeetingId: string;
  userId: string;
  week: number;
  type: "SKIP";
}

export interface BusyBlock {
  id: string;
  userId: string;
  weekday: Weekday;
  startPeriod: number;
  endPeriod: number;
  weeks: number[];
  title?: string;
}

export interface ScheduleDataset {
  users: User[];
  courses: Course[];
  meetings: CourseMeeting[];
  exceptions: CourseException[];
  busyBlocks: BusyBlock[];
}

export interface AvailabilityDetail {
  userId: string;
  nickname: string;
  free: boolean;
  label?: string;
  /** 课表未知（未录入且未确认无课）：不计入有空结论 */
  unknown?: boolean;
}

export interface AvailabilitySlot {
  commonFree: boolean;
  freeCount: number;
  selectedUsers: number;
  unknownCount: number;
  details: AvailabilityDetail[];
}

/** 成员课表完整度三态：已录入（有课程或忙碌）、已确认无课、未知（AV-03/AV-04） */
export type MemberScheduleState = "recorded" | "confirmedEmpty" | "unrecorded";
