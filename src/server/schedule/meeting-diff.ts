export interface MeetingRowLike {
  weekday: number;
  startPeriod: number;
  endPeriod: number;
  weeks: number[];
}

export interface ExistingMeetingRow extends MeetingRowLike {
  id: string;
}

export interface MeetingDiff {
  /** 内容未变化的现有时段：保留原 id，其上的「本周不去」记录不受影响 */
  keptIds: string[];
  /** 被删除（或时间/周次被改）的现有时段 id，级联移除其例外记录 */
  removedIds: string[];
  /** 新增的时段 */
  inserts: MeetingRowLike[];
}

function meetingKey(meeting: MeetingRowLike) {
  const weeks = [...meeting.weeks].sort((a, b) => a - b).join(",");
  return `${meeting.weekday}|${meeting.startPeriod}|${meeting.endPeriod}|${weeks}`;
}

// 编辑课程时按「星期+节次+周次」比对新旧时段：完全一致的保留（连同其 Skip 记录），
// 其余删除重建。输入中的重复行不会被合并，多出的重复行会各自插入。
export function diffCourseMeetings(existing: ExistingMeetingRow[], input: MeetingRowLike[]): MeetingDiff {
  const availableByKey = new Map<string, string[]>();
  for (const meeting of existing) {
    const key = meetingKey(meeting);
    const ids = availableByKey.get(key);
    if (ids) ids.push(meeting.id);
    else availableByKey.set(key, [meeting.id]);
  }

  const keptIds: string[] = [];
  const inserts: MeetingRowLike[] = [];
  for (const meeting of input) {
    const key = meetingKey(meeting);
    const ids = availableByKey.get(key);
    const matchedId = ids?.shift();
    if (matchedId) {
      keptIds.push(matchedId);
      if (ids?.length === 0) availableByKey.delete(key);
    } else {
      inserts.push({
        weekday: meeting.weekday,
        startPeriod: meeting.startPeriod,
        endPeriod: meeting.endPeriod,
        weeks: [...meeting.weeks].sort((a, b) => a - b),
      });
    }
  }

  const keptSet = new Set(keptIds);
  const removedIds = existing.filter((meeting) => !keptSet.has(meeting.id)).map((meeting) => meeting.id);
  return { keptIds, removedIds, inserts };
}
