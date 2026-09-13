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
}

export interface AvailabilitySlot {
  commonFree: boolean;
  freeCount: number;
  selectedUsers: number;
  details: AvailabilityDetail[];
}
