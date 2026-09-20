export interface MinuteInterval {
  startMin: number;
  endMin: number;
}

// 钟点轴上的共同空闲 = 所选成员忙碌区间并集在显示轴范围内的补集。
// 空档推荐、时长筛选与复制文本都以这里的结果为准，避免按节次拼接时
// 跨过网格行之间的午间、课间忙碌（AV-02）。
export function commonFreeIntervals(
  busyRanges: MinuteInterval[],
  axisStart: number,
  axisEnd: number,
): MinuteInterval[] {
  if (axisStart >= axisEnd) return [];
  const sorted = [...busyRanges].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const merged: MinuteInterval[] = [];
  for (const range of sorted) {
    if (range.endMin <= range.startMin) continue;
    const last = merged[merged.length - 1];
    if (last && range.startMin <= last.endMin) {
      if (range.endMin > last.endMin) last.endMin = range.endMin;
    } else {
      merged.push({ ...range });
    }
  }
  const free: MinuteInterval[] = [];
  let cursor = axisStart;
  for (const busy of merged) {
    const start = Math.max(busy.startMin, axisStart);
    const end = Math.min(busy.endMin, axisEnd);
    if (start >= end) continue;
    if (start > cursor) free.push({ startMin: cursor, endMin: start });
    cursor = Math.max(cursor, end);
  }
  if (cursor < axisEnd) free.push({ startMin: cursor, endMin: axisEnd });
  return free;
}
