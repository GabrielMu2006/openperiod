import type {
  AvailabilityDetail,
  AvailabilitySlot,
  PrivacyLevel,
  ScheduleDataset,
  Weekday,
} from "./schedule";

export interface AvailabilityQuery {
  week: number;
  weekday: Weekday;
  period: number;
  selectedUserIds: string[];
  viewerId: string;
  privacyByUserId?: Record<string, PrivacyLevel>;
}

function includesPeriod(start: number, end: number, period: number) {
  return period >= start && period <= end;
}

export function calculateAvailabilitySlot(
  dataset: ScheduleDataset,
  query: AvailabilityQuery,
): AvailabilitySlot {
  const selectedUsers = query.selectedUserIds
    .map((id) => dataset.users.find((user) => user.id === id))
    .filter((user): user is NonNullable<typeof user> => Boolean(user));

  const details: AvailabilityDetail[] = selectedUsers.map((user) => {
    const meeting = dataset.meetings.find((candidate) => {
      const course = dataset.courses.find((item) => item.id === candidate.courseId);
      if (!course || course.userId !== user.id) return false;
      if (candidate.weekday !== query.weekday || !candidate.weeks.includes(query.week)) return false;
      if (!includesPeriod(candidate.startPeriod, candidate.endPeriod, query.period)) return false;

      return !dataset.exceptions.some(
        (exception) =>
          exception.courseMeetingId === candidate.id &&
          exception.userId === user.id &&
          exception.week === query.week &&
          exception.type === "SKIP",
      );
    });

    const busy = dataset.busyBlocks.some(
      (block) =>
        block.userId === user.id &&
        block.weekday === query.weekday &&
        block.weeks.includes(query.week) &&
        includesPeriod(block.startPeriod, block.endPeriod, query.period),
    );

    const free = !meeting && !busy;
    if (free) return { userId: user.id, nickname: user.nickname, free: true };

    // Busy titles are private. Course fields are projected at the privacy boundary.
    if (!meeting || user.id === query.viewerId) {
      return { userId: user.id, nickname: user.nickname, free: false, label: "忙碌" };
    }

    const course = dataset.courses.find((item) => item.id === meeting.courseId);
    const privacy = query.privacyByUserId?.[user.id] ?? user.defaultPrivacyLevel;
    if (!course || privacy === 0) {
      return { userId: user.id, nickname: user.nickname, free: false, label: "忙碌" };
    }

    const label =
      privacy === 1
        ? course.name
        : [course.name, course.location, course.instructor].filter(Boolean).join(" · ");
    return { userId: user.id, nickname: user.nickname, free: false, label };
  });

  const freeCount = details.filter((detail) => detail.free).length;
  return {
    commonFree: selectedUsers.length > 0 && freeCount === selectedUsers.length,
    freeCount,
    selectedUsers: selectedUsers.length,
    // 该纯函数不掌握课表完整度状态；数据集内的用户一律按已录入处理
    unknownCount: 0,
    details,
  };
}
