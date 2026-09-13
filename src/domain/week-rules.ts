export interface WeekParseResult {
  weeks: number[];
  recognized: boolean;
}

export function parseWeekRule(input: unknown, weekCount = 16): WeekParseResult {
  const all = Array.from({ length: weekCount }, (_, index) => index + 1);
  const text = String(input ?? "").trim().replace(/[－—–~～至]/g, "-").replace(/周/g, "");
  if (!text) return { weeks: all, recognized: false };

  const upper = text.toUpperCase();
  if (["ALL", "全", "全部", `1-${weekCount}`].includes(upper)) return { weeks: all, recognized: true };

  const odd = /单|ODD/.test(upper);
  const even = /双|EVEN/.test(upper);
  const weeks = new Set<number>();

  for (const match of upper.matchAll(/(\d{1,2})(?:\s*-\s*(\d{1,2}))?/g)) {
    const start = Number(match[1]);
    const end = match[2] ? Number(match[2]) : start;
    for (let week = Math.min(start, end); week <= Math.max(start, end); week += 1) {
      if (week >= 1 && week <= weekCount) weeks.add(week);
    }
  }

  let result = weeks.size ? [...weeks] : all;
  if (odd && !even) result = result.filter((week) => week % 2 === 1);
  if (even && !odd) result = result.filter((week) => week % 2 === 0);
  return { weeks: result.sort((a, b) => a - b), recognized: (weeks.size > 0 || odd || even) && result.length > 0 };
}
