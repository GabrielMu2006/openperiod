// 学校作息预设：把「第 N 节」翻译成钟点时间的唯一来源。
// 新增学校 = 在 SCHEDULE_PRESETS 里加一个预设，网格行数、导入解析、时间显示都会自动跟随。
// 不变量：rows 按 period 1..N 连续排列、时间单调递增且互不重叠、N ≤ MAX_PERIOD_COUNT。

export type ScheduleRow = {
  /** 节次号（1 起）。自定义作息行可省略，由渲染方按顺序补齐 */
  period?: number;
  start: string;
  end: string;
  /** 网格行显示名（大节制学校的小节行没有独立名字时可省略） */
  label?: string;
};

/** 大节 → 小节区间（from/to 均含）。仅大节制（kind="block"）学校需要。 */
export type ScheduleBlock = {
  label: string;
  from: number;
  to: number;
};

export type SchedulePreset = {
  id: string;
  /** 展示名，如「北京大学」 */
  school: string;
  /** 变体说明（校区 / 冬夏令时），如「江安校区」「夏季作息」 */
  variant?: string;
  /** period: 课表以小节号排课；block: 课表以大节号排课（导入时经 blocks 展开） */
  kind: "period" | "block";
  rows: ScheduleRow[];
  blocks?: ScheduleBlock[];
};

export const MAX_PERIOD_COUNT = 16;

export const PKU_SCHEDULE: SchedulePreset = {
  id: "pku",
  school: "北京大学",
  kind: "period",
  rows: [
    { period: 1, start: "08:00", end: "08:50" },
    { period: 2, start: "09:00", end: "09:50" },
    { period: 3, start: "10:10", end: "11:00" },
    { period: 4, start: "11:10", end: "12:00" },
    { period: 5, start: "13:00", end: "13:50" },
    { period: 6, start: "14:00", end: "14:50" },
    { period: 7, start: "15:10", end: "16:00" },
    { period: 8, start: "16:10", end: "17:00" },
    { period: 9, start: "17:10", end: "18:00" },
    { period: 10, start: "18:40", end: "19:30" },
    { period: 11, start: "19:40", end: "20:30" },
    { period: 12, start: "20:40", end: "21:30" },
  ],
};

// 对外经济贸易大学：5 大节制（每大节 2 或 3 小节连堂）。
// 来源：教务处《关于调整全校本科教学作息时间的通知》
// 一 08:00–09:30｜二 09:50–11:20 或 09:50–12:10｜三 13:30–15:00｜四 15:20–16:50 或 –17:40｜五 18:30–20:00 或 –20:50
// 大节拆小节规则：按大节时长均分；三节大节的第 3 小节 = 大节尾段。
export const UIBE_SCHEDULE: SchedulePreset = {
  id: "uibe",
  school: "对外经济贸易大学",
  kind: "block",
  rows: [
    { period: 1, start: "08:00", end: "08:45" },
    { period: 2, start: "08:45", end: "09:30" },
    { period: 3, start: "09:50", end: "10:35" },
    { period: 4, start: "10:35", end: "11:20" },
    { period: 5, start: "11:20", end: "12:10" },
    { period: 6, start: "13:30", end: "14:15" },
    { period: 7, start: "14:15", end: "15:00" },
    { period: 8, start: "15:20", end: "16:05" },
    { period: 9, start: "16:05", end: "16:50" },
    { period: 10, start: "16:50", end: "17:40" },
    { period: 11, start: "18:30", end: "19:15" },
    { period: 12, start: "19:15", end: "20:00" },
    { period: 13, start: "20:00", end: "20:50" },
  ],
  blocks: [
    { label: "第一大节", from: 1, to: 2 },
    { label: "第二大节", from: 3, to: 5 },
    { label: "第三大节", from: 6, to: 7 },
    { label: "第四大节", from: 8, to: 10 },
    { label: "第五大节", from: 11, to: 13 },
  ],
};



const A_CLASS_PRESETS: SchedulePreset[] = [
    {
    id: "qinghua",
    school: "清华大学",
    kind: "period",
    rows: [
      { period: 1, start: "08:00", end: "08:45" },
      { period: 2, start: "08:50", end: "09:35" },
      { period: 3, start: "09:50", end: "10:35" },
      { period: 4, start: "10:40", end: "11:25" },
      { period: 5, start: "11:30", end: "12:15" },
      { period: 6, start: "13:30", end: "14:15" },
      { period: 7, start: "14:20", end: "15:05" },
      { period: 8, start: "15:20", end: "16:05" },
      { period: 9, start: "16:10", end: "16:55" },
      { period: 10, start: "17:05", end: "17:50" },
      { period: 11, start: "17:55", end: "18:40" },
      { period: 12, start: "19:20", end: "20:05" },
      { period: 13, start: "20:10", end: "20:55" },
      { period: 14, start: "21:00", end: "21:45" },
    ],
  },
    {
    id: "fudan",
    school: "复旦大学",
    kind: "period",
    rows: [
      { period: 1, start: "08:00", end: "08:45" },
      { period: 2, start: "08:55", end: "09:40" },
      { period: 3, start: "09:55", end: "10:40" },
      { period: 4, start: "10:50", end: "11:35" },
      { period: 5, start: "11:45", end: "12:30" },
      { period: 6, start: "13:30", end: "14:15" },
      { period: 7, start: "14:25", end: "15:10" },
      { period: 8, start: "15:25", end: "16:10" },
      { period: 9, start: "16:20", end: "17:05" },
      { period: 10, start: "17:15", end: "18:00" },
      { period: 11, start: "18:30", end: "19:15" },
      { period: 12, start: "19:25", end: "20:10" },
    ],
  },
    {
    id: "sjtu",
    school: "上海交通大学",
    kind: "period",
    rows: [
      { period: 1, start: "08:00", end: "08:45" },
      { period: 2, start: "08:55", end: "09:40" },
      { period: 3, start: "10:00", end: "10:45" },
      { period: 4, start: "10:55", end: "11:40" },
      { period: 5, start: "12:00", end: "12:45" },
      { period: 6, start: "12:55", end: "13:40" },
      { period: 7, start: "14:00", end: "14:45" },
      { period: 8, start: "14:55", end: "15:40" },
      { period: 9, start: "16:00", end: "16:45" },
      { period: 10, start: "16:55", end: "17:40" },
      { period: 11, start: "18:00", end: "18:45" },
      { period: 12, start: "18:55", end: "19:40" },
      { period: 13, start: "19:50", end: "20:35" },
    ],
  },
    {
    id: "zju",
    school: "浙江大学",
    kind: "period",
    rows: [
      { period: 1, start: "08:00", end: "08:45" },
      { period: 2, start: "08:50", end: "09:35" },
      { period: 3, start: "10:00", end: "10:45" },
      { period: 4, start: "10:50", end: "11:35" },
      { period: 5, start: "11:40", end: "12:25" },
      { period: 6, start: "13:25", end: "14:10" },
      { period: 7, start: "14:15", end: "15:00" },
      { period: 8, start: "15:25", end: "16:10" },
      { period: 9, start: "16:15", end: "17:00" },
      { period: 10, start: "17:05", end: "17:50" },
      { period: 11, start: "18:50", end: "19:35" },
      { period: 12, start: "19:40", end: "20:25" },
      { period: 13, start: "20:30", end: "21:15" },
    ],
  },
    {
    id: "nju",
    school: "南京大学",
    kind: "period",
    rows: [
      { period: 1, start: "08:00", end: "08:50" },
      { period: 2, start: "08:55", end: "09:45" },
      { period: 3, start: "10:00", end: "10:50" },
      { period: 4, start: "10:55", end: "11:45" },
      { period: 5, start: "12:00", end: "12:50" },
      { period: 6, start: "13:30", end: "14:20" },
      { period: 7, start: "14:25", end: "15:15" },
      { period: 8, start: "15:30", end: "16:20" },
      { period: 9, start: "16:25", end: "17:15" },
      { period: 10, start: "17:20", end: "18:10" },
      { period: 11, start: "18:30", end: "19:20" },
      { period: 12, start: "19:25", end: "20:15" },
      { period: 13, start: "20:20", end: "21:10" },
      { period: 14, start: "21:15", end: "22:05" },
    ],
  },
    {
    id: "ustc",
    school: "中国科学技术大学",
    kind: "period",
    rows: [
      { period: 1, start: "07:50", end: "08:35" },
      { period: 2, start: "08:40", end: "09:25" },
      { period: 3, start: "09:45", end: "10:30" },
      { period: 4, start: "10:35", end: "11:20" },
      { period: 5, start: "11:25", end: "12:10" },
      { period: 6, start: "14:00", end: "14:45" },
      { period: 7, start: "14:50", end: "15:35" },
      { period: 8, start: "15:55", end: "16:40" },
      { period: 9, start: "16:45", end: "17:30" },
      { period: 10, start: "17:35", end: "18:20" },
      { period: 11, start: "19:30", end: "20:15" },
      { period: 12, start: "20:20", end: "21:05" },
      { period: 13, start: "21:10", end: "21:55" },
    ],
  },
    {
    id: "hit",
    school: "哈尔滨工业大学",
    kind: "period",
    rows: [
      { period: 1, start: "08:00", end: "08:50" },
      { period: 2, start: "08:55", end: "09:45" },
      { period: 3, start: "10:00", end: "10:50" },
      { period: 4, start: "10:55", end: "11:45" },
      { period: 5, start: "13:45", end: "14:35" },
      { period: 6, start: "14:40", end: "15:30" },
      { period: 7, start: "15:45", end: "16:35" },
      { period: 8, start: "16:40", end: "17:30" },
      { period: 9, start: "18:00", end: "18:50" },
      { period: 10, start: "18:55", end: "19:45" },
      { period: 11, start: "19:50", end: "20:40" },
    ],
  },
    {
    id: "xjtu-winter",
    school: "西安交通大学",
  variant: "冬季作息",
    kind: "period",
    rows: [
      { period: 1, start: "08:00", end: "08:50" },
      { period: 2, start: "09:00", end: "09:50" },
      { period: 3, start: "10:10", end: "11:00" },
      { period: 4, start: "11:10", end: "12:00" },
      { period: 5, start: "14:00", end: "14:50" },
      { period: 6, start: "15:00", end: "15:50" },
      { period: 7, start: "16:10", end: "17:00" },
      { period: 8, start: "17:10", end: "18:00" },
      { period: 9, start: "19:00", end: "19:50" },
      { period: 10, start: "20:00", end: "20:50" },
      { period: 11, start: "21:00", end: "21:50" },
    ],
  },
    {
    id: "xjtu-summer",
    school: "西安交通大学",
  variant: "夏季作息",
    kind: "period",
    rows: [
      { period: 1, start: "08:00", end: "08:50" },
      { period: 2, start: "09:00", end: "09:50" },
      { period: 3, start: "10:10", end: "11:00" },
      { period: 4, start: "11:10", end: "12:00" },
      { period: 5, start: "14:30", end: "15:20" },
      { period: 6, start: "15:30", end: "16:20" },
      { period: 7, start: "16:40", end: "17:30" },
      { period: 8, start: "17:40", end: "18:30" },
      { period: 9, start: "19:00", end: "19:50" },
      { period: 10, start: "20:00", end: "20:50" },
      { period: 11, start: "21:00", end: "21:50" },
    ],
  },
    {
    id: "buaa",
    school: "北京航空航天大学",
    kind: "period",
    rows: [
      { period: 1, start: "08:00", end: "08:45" },
      { period: 2, start: "08:50", end: "09:35" },
      { period: 3, start: "09:50", end: "10:35" },
      { period: 4, start: "10:40", end: "11:25" },
      { period: 5, start: "11:30", end: "12:15" },
      { period: 6, start: "14:00", end: "14:45" },
      { period: 7, start: "14:50", end: "15:35" },
      { period: 8, start: "15:50", end: "16:35" },
      { period: 9, start: "16:40", end: "17:25" },
      { period: 10, start: "17:30", end: "18:15" },
      { period: 11, start: "19:00", end: "19:45" },
      { period: 12, start: "19:50", end: "20:35" },
      { period: 13, start: "20:40", end: "21:25" },
      { period: 14, start: "21:30", end: "22:15" },
    ],
  },
    {
    id: "bnu",
    school: "北京师范大学",
    kind: "period",
    rows: [
      { period: 1, start: "08:00", end: "08:45" },
      { period: 2, start: "08:55", end: "09:40" },
      { period: 3, start: "10:00", end: "10:45" },
      { period: 4, start: "10:55", end: "11:40" },
      { period: 5, start: "13:30", end: "14:15" },
      { period: 6, start: "14:25", end: "15:10" },
      { period: 7, start: "15:30", end: "16:15" },
      { period: 8, start: "16:25", end: "17:10" },
      { period: 9, start: "18:00", end: "18:45" },
      { period: 10, start: "18:55", end: "19:40" },
      { period: 11, start: "19:50", end: "20:35" },
      { period: 12, start: "20:45", end: "21:30" },
    ],
  },
    {
    id: "nankai",
    school: "南开大学",
    kind: "period",
    rows: [
      { period: 1, start: "08:00", end: "08:45" },
      { period: 2, start: "08:55", end: "09:40" },
      { period: 3, start: "10:00", end: "10:45" },
      { period: 4, start: "10:55", end: "11:40" },
      { period: 5, start: "12:00", end: "12:45" },
      { period: 6, start: "12:55", end: "13:40" },
      { period: 7, start: "14:00", end: "14:45" },
      { period: 8, start: "14:55", end: "15:40" },
      { period: 9, start: "16:00", end: "16:45" },
      { period: 10, start: "16:55", end: "17:40" },
      { period: 11, start: "18:30", end: "19:15" },
      { period: 12, start: "19:25", end: "20:10" },
      { period: 13, start: "20:20", end: "21:05" },
      { period: 14, start: "21:15", end: "22:00" },
    ],
  },
    {
    id: "tju",
    school: "天津大学",
    kind: "period",
    rows: [
      { period: 1, start: "08:30", end: "09:15" },
      { period: 2, start: "09:20", end: "10:05" },
      { period: 3, start: "10:25", end: "11:10" },
      { period: 4, start: "11:15", end: "12:00" },
      { period: 5, start: "13:30", end: "14:15" },
      { period: 6, start: "14:20", end: "15:05" },
      { period: 7, start: "15:25", end: "16:10" },
      { period: 8, start: "16:15", end: "17:00" },
      { period: 9, start: "18:30", end: "19:15" },
      { period: 10, start: "19:20", end: "20:05" },
      { period: 11, start: "20:10", end: "20:55" },
      { period: 12, start: "21:00", end: "21:45" },
    ],
  },
    {
    id: "sdu-autumnwinter",
    school: "山东大学",
  variant: "春秋冬季作息",
    kind: "period",
    rows: [
      { period: 1, start: "08:00", end: "08:50" },
      { period: 2, start: "09:00", end: "09:50" },
      { period: 3, start: "10:10", end: "11:00" },
      { period: 4, start: "11:10", end: "12:00" },
      { period: 5, start: "13:30", end: "14:20" },
      { period: 6, start: "14:30", end: "15:20" },
      { period: 7, start: "15:30", end: "16:20" },
      { period: 8, start: "16:30", end: "17:20" },
      { period: 9, start: "18:30", end: "19:20" },
      { period: 10, start: "19:30", end: "20:20" },
      { period: 11, start: "20:30", end: "21:20" },
    ],
  },
    {
    id: "sdu-summer",
    school: "山东大学",
  variant: "夏季作息",
    kind: "period",
    rows: [
      { period: 1, start: "08:00", end: "08:50" },
      { period: 2, start: "09:00", end: "09:50" },
      { period: 3, start: "10:10", end: "11:00" },
      { period: 4, start: "11:10", end: "12:00" },
      { period: 5, start: "14:00", end: "14:50" },
      { period: 6, start: "15:00", end: "15:50" },
      { period: 7, start: "16:00", end: "16:50" },
      { period: 8, start: "17:00", end: "17:50" },
      { period: 9, start: "19:00", end: "19:50" },
      { period: 10, start: "20:00", end: "20:50" },
      { period: 11, start: "21:00", end: "21:50" },
    ],
  },
    // 华中科技大学：12 小节制。来源：项目所有者提供的「教学作息时间」官方表（2026-09 确认，
    // 与华中师范大学教务处校历一致）；第 6–8 节由旧版 14:50/15:55/16:45 修正为 14:55/16:10/17:05 起。
    {
    id: "hust",
    school: "华中科技大学",
    kind: "period",
    rows: [
      { period: 1, start: "08:00", end: "08:45" },
      { period: 2, start: "08:55", end: "09:40" },
      { period: 3, start: "10:10", end: "10:55" },
      { period: 4, start: "11:05", end: "11:50" },
      { period: 5, start: "14:00", end: "14:45" },
      { period: 6, start: "14:55", end: "15:40" },
      { period: 7, start: "16:10", end: "16:55" },
      { period: 8, start: "17:05", end: "17:50" },
      { period: 9, start: "18:30", end: "19:15" },
      { period: 10, start: "19:20", end: "20:05" },
      { period: 11, start: "20:15", end: "21:00" },
      { period: 12, start: "21:05", end: "21:50" },
    ],
  },
    // 华中师范大学：12 小节制。来源：教务处官网校历「教学作息时间」（jwc.ccnu.edu.cn，2026-09 抓取），
    // 上午 8:00 起、下午 14:00 起、晚上 18:30 起，每节 45 分钟。
    {
    id: "ccnu",
    school: "华中师范大学",
    kind: "period",
    rows: [
      { period: 1, start: "08:00", end: "08:45" },
      { period: 2, start: "08:55", end: "09:40" },
      { period: 3, start: "10:10", end: "10:55" },
      { period: 4, start: "11:05", end: "11:50" },
      { period: 5, start: "14:00", end: "14:45" },
      { period: 6, start: "14:55", end: "15:40" },
      { period: 7, start: "16:10", end: "16:55" },
      { period: 8, start: "17:05", end: "17:50" },
      { period: 9, start: "18:30", end: "19:15" },
      { period: 10, start: "19:20", end: "20:05" },
      { period: 11, start: "20:15", end: "21:00" },
      { period: 12, start: "21:05", end: "21:50" },
    ],
  },
    {
    id: "csu",
    school: "中南大学",
    kind: "period",
    rows: [
      { period: 1, start: "08:00", end: "08:45" },
      { period: 2, start: "08:55", end: "09:40" },
      { period: 3, start: "10:00", end: "10:45" },
      { period: 4, start: "10:55", end: "11:40" },
      { period: 5, start: "14:00", end: "14:45" },
      { period: 6, start: "14:55", end: "15:40" },
      { period: 7, start: "16:00", end: "16:45" },
      { period: 8, start: "16:55", end: "17:40" },
      { period: 9, start: "19:00", end: "19:45" },
      { period: 10, start: "19:55", end: "20:40" },
    ],
  },
    {
    id: "sysu",
    school: "中山大学",
    kind: "period",
    rows: [
      { period: 1, start: "08:00", end: "08:45" },
      { period: 2, start: "08:55", end: "09:40" },
      { period: 3, start: "10:10", end: "10:55" },
      { period: 4, start: "11:05", end: "11:50" },
      { period: 5, start: "14:20", end: "15:05" },
      { period: 6, start: "15:15", end: "16:00" },
      { period: 7, start: "16:30", end: "17:15" },
      { period: 8, start: "17:25", end: "18:10" },
      { period: 9, start: "19:00", end: "19:45" },
      { period: 10, start: "19:55", end: "20:40" },
      { period: 11, start: "20:50", end: "21:35" },
    ],
  },
    {
    id: "xmu",
    school: "厦门大学",
    kind: "period",
    rows: [
      { period: 1, start: "08:00", end: "08:45" },
      { period: 2, start: "08:55", end: "09:40" },
      { period: 3, start: "10:10", end: "10:55" },
      { period: 4, start: "11:05", end: "11:50" },
      { period: 5, start: "14:30", end: "15:15" },
      { period: 6, start: "15:25", end: "16:10" },
      { period: 7, start: "16:40", end: "17:25" },
      { period: 8, start: "17:35", end: "18:20" },
      { period: 9, start: "19:10", end: "19:55" },
      { period: 10, start: "20:05", end: "20:50" },
      { period: 11, start: "21:00", end: "21:45" },
    ],
  },
    {
    id: "seu",
    school: "东南大学",
    kind: "period",
    rows: [
      { period: 1, start: "08:00", end: "08:45" },
      { period: 2, start: "08:50", end: "09:35" },
      { period: 3, start: "09:50", end: "10:35" },
      { period: 4, start: "10:40", end: "11:25" },
      { period: 5, start: "11:30", end: "12:15" },
      { period: 6, start: "14:00", end: "14:45" },
      { period: 7, start: "14:50", end: "15:35" },
      { period: 8, start: "15:50", end: "16:35" },
      { period: 9, start: "16:40", end: "17:25" },
      { period: 10, start: "17:30", end: "18:15" },
      { period: 11, start: "18:30", end: "19:15" },
      { period: 12, start: "19:20", end: "20:05" },
      { period: 13, start: "20:10", end: "20:55" },
    ],
  },
    {
    id: "tongji",
    school: "同济大学",
    kind: "period",
    rows: [
      { period: 1, start: "08:00", end: "08:45" },
      { period: 2, start: "08:50", end: "09:35" },
      { period: 3, start: "10:00", end: "10:45" },
      { period: 4, start: "10:50", end: "11:35" },
      { period: 5, start: "13:30", end: "14:15" },
      { period: 6, start: "14:20", end: "15:05" },
      { period: 7, start: "15:30", end: "16:15" },
      { period: 8, start: "16:20", end: "17:05" },
      { period: 9, start: "18:30", end: "19:15" },
      { period: 10, start: "19:20", end: "20:05" },
      { period: 11, start: "20:10", end: "20:55" },
    ],
  },
    {
    id: "ecnu",
    school: "华东师范大学",
    kind: "period",
    rows: [
      { period: 1, start: "08:00", end: "08:45" },
      { period: 2, start: "08:50", end: "09:35" },
      { period: 3, start: "09:50", end: "10:35" },
      { period: 4, start: "10:40", end: "11:25" },
      { period: 5, start: "11:30", end: "12:15" },
      { period: 6, start: "13:00", end: "13:45" },
      { period: 7, start: "13:50", end: "14:35" },
      { period: 8, start: "14:50", end: "15:35" },
      { period: 9, start: "15:40", end: "16:25" },
      { period: 10, start: "16:30", end: "17:15" },
      { period: 11, start: "18:00", end: "18:45" },
      { period: 12, start: "18:50", end: "19:35" },
      { period: 13, start: "19:40", end: "20:25" },
      { period: 14, start: "20:30", end: "21:15" },
    ],
  },
    {
    id: "scu-wangjiang",
    school: "四川大学",
  variant: "望江/华西校区",
    kind: "period",
    rows: [
      { period: 1, start: "08:00", end: "08:45" },
      { period: 2, start: "08:55", end: "09:40" },
      { period: 3, start: "10:00", end: "10:45" },
      { period: 4, start: "10:55", end: "11:40" },
      { period: 5, start: "14:00", end: "14:45" },
      { period: 6, start: "14:55", end: "15:40" },
      { period: 7, start: "15:50", end: "16:35" },
      { period: 8, start: "16:55", end: "17:40" },
      { period: 9, start: "17:50", end: "18:35" },
      { period: 10, start: "19:30", end: "20:15" },
      { period: 11, start: "20:25", end: "21:10" },
      { period: 12, start: "21:20", end: "22:05" },
    ],
  },
    {
    id: "scu-jiangan",
    school: "四川大学",
  variant: "江安校区",
    kind: "period",
    rows: [
      { period: 1, start: "08:15", end: "09:00" },
      { period: 2, start: "09:10", end: "09:55" },
      { period: 3, start: "10:15", end: "11:00" },
      { period: 4, start: "11:10", end: "11:55" },
      { period: 5, start: "13:50", end: "14:35" },
      { period: 6, start: "14:45", end: "15:30" },
      { period: 7, start: "15:40", end: "16:25" },
      { period: 8, start: "16:45", end: "17:30" },
      { period: 9, start: "17:40", end: "18:25" },
      { period: 10, start: "19:20", end: "20:05" },
      { period: 11, start: "20:15", end: "21:00" },
      { period: 12, start: "21:10", end: "21:55" },
    ],
  },
    {
    id: "uestc",
    school: "电子科技大学",
    kind: "period",
    rows: [
      { period: 1, start: "08:30", end: "09:15" },
      { period: 2, start: "09:20", end: "10:05" },
      { period: 3, start: "10:20", end: "11:05" },
      { period: 4, start: "11:10", end: "11:55" },
      { period: 5, start: "14:30", end: "15:15" },
      { period: 6, start: "15:20", end: "16:05" },
      { period: 7, start: "16:20", end: "17:05" },
      { period: 8, start: "17:10", end: "17:55" },
      { period: 9, start: "19:30", end: "20:15" },
      { period: 10, start: "20:20", end: "21:05" },
      { period: 11, start: "21:10", end: "21:55" },
      { period: 12, start: "22:00", end: "22:45" },
    ],
  },
    {
    id: "lzu-summer",
    school: "兰州大学",
  variant: "夏季作息",
    kind: "period",
    rows: [
      { period: 1, start: "08:30", end: "09:15" },
      { period: 2, start: "09:25", end: "10:10" },
      { period: 3, start: "10:30", end: "11:15" },
      { period: 4, start: "11:25", end: "12:10" },
      { period: 5, start: "14:30", end: "15:15" },
      { period: 6, start: "15:25", end: "16:10" },
      { period: 7, start: "16:20", end: "17:05" },
      { period: 8, start: "17:15", end: "18:00" },
      { period: 9, start: "18:30", end: "19:15" },
      { period: 10, start: "19:25", end: "20:10" },
      { period: 11, start: "20:20", end: "21:05" },
    ],
  },
    {
    id: "lzu-winter",
    school: "兰州大学",
  variant: "冬季作息",
    kind: "period",
    rows: [
      { period: 1, start: "09:00", end: "09:45" },
      { period: 2, start: "09:55", end: "10:40" },
      { period: 3, start: "11:00", end: "11:45" },
      { period: 4, start: "11:55", end: "12:40" },
      { period: 5, start: "14:00", end: "14:45" },
      { period: 6, start: "14:55", end: "15:40" },
      { period: 7, start: "15:50", end: "16:35" },
      { period: 8, start: "16:45", end: "17:30" },
      { period: 9, start: "18:00", end: "18:45" },
      { period: 10, start: "18:55", end: "19:40" },
      { period: 11, start: "19:50", end: "20:35" },
    ],
  },
    // 中国人民大学：6 大节制（每大节 90 分钟，含特色的午间大节）。
    // 来源：学生作息资料多源交叉验证（上午 8:00/10:00、下午 14:00/16:00、晚上 18:00 起）；
    // 午间 12:00–13:30 有常规排课先例（校方新闻「走进三农」通识课每周二中午上课）。
    {
    id: "ruc",
    school: "中国人民大学",
    kind: "period",
    rows: [
      { period: 1, start: "08:00", end: "09:30" },
      { period: 2, start: "10:00", end: "11:30" },
      { period: 3, start: "12:00", end: "13:30" },
      { period: 4, start: "14:00", end: "15:30" },
      { period: 5, start: "16:00", end: "17:30" },
      { period: 6, start: "18:00", end: "19:30" },
    ],
  },
    // 武汉大学：12 小节制（每节 45 分钟）。来源：研究生课表整理版与多份新生资料交叉验证
    // （第一节 8:00、第五节 11:30–12:15、第六节 14:05 起为多源一致；晚间按 18:30 起连排）。
    // 注意：武大实行夏/冬令作息，夏季学期下午节次可能整体提前，如有偏差请反馈或改用自定义作息。
    {
    id: "whu",
    school: "武汉大学",
    kind: "period",
    rows: [
      { period: 1, start: "08:00", end: "08:45" },
      { period: 2, start: "08:50", end: "09:35" },
      { period: 3, start: "09:50", end: "10:35" },
      { period: 4, start: "10:40", end: "11:25" },
      { period: 5, start: "11:30", end: "12:15" },
      { period: 6, start: "14:05", end: "14:50" },
      { period: 7, start: "14:55", end: "15:40" },
      { period: 8, start: "15:45", end: "16:30" },
      { period: 9, start: "16:40", end: "17:25" },
      { period: 10, start: "18:30", end: "19:15" },
      { period: 11, start: "19:20", end: "20:05" },
      { period: 12, start: "20:10", end: "20:55" },
    ],
  },
    // 吉林大学：12 小节制。来源：教务处官网「上课时间」页（jwc.jlu.edu.cn/sksj.htm，2026-09 抓取），
    // 上午 4 节、下午 4 节、晚上 4 节（9-10 节连上，11-12 节连上）。
    {
    id: "jlu",
    school: "吉林大学",
    kind: "period",
    rows: [
      { period: 1, start: "08:00", end: "08:45" },
      { period: 2, start: "08:55", end: "09:40" },
      { period: 3, start: "10:00", end: "10:45" },
      { period: 4, start: "10:55", end: "11:40" },
      { period: 5, start: "13:30", end: "14:15" },
      { period: 6, start: "14:25", end: "15:10" },
      { period: 7, start: "15:30", end: "16:15" },
      { period: 8, start: "16:25", end: "17:10" },
      { period: 9, start: "18:20", end: "19:05" },
      { period: 10, start: "19:05", end: "19:50" },
      { period: 11, start: "20:00", end: "20:45" },
      { period: 12, start: "20:45", end: "21:30" },
    ],
  },
    // 重庆大学：12 小节制。来源：教务处官网「校历/行课时间」（jwc.cqu.edu.cn 首页，2020-08-31 起执行，
    // 2026-09 全文抓取 + 搜索摘要互证）。注意：网传旧版「第 5 节 14:00 起」已过时，现行下午 13:30 开始。
    {
    id: "cqu",
    school: "重庆大学",
    kind: "period",
    rows: [
      { period: 1, start: "08:30", end: "09:15" },
      { period: 2, start: "09:25", end: "10:10" },
      { period: 3, start: "10:30", end: "11:15" },
      { period: 4, start: "11:25", end: "12:10" },
      { period: 5, start: "13:30", end: "14:15" },
      { period: 6, start: "14:25", end: "15:10" },
      { period: 7, start: "15:20", end: "16:05" },
      { period: 8, start: "16:25", end: "17:10" },
      { period: 9, start: "17:20", end: "18:05" },
      { period: 10, start: "19:00", end: "19:45" },
      { period: 11, start: "19:55", end: "20:40" },
      { period: 12, start: "20:50", end: "21:35" },
    ],
  },
    // 西北工业大学：13 小节制（长安校区，本科生主校区，全年统一）。
    // 来源：教务部官网首页「作息时间安排」（jiaowu.nwpu.edu.cn，2026-09 全文抓取，含友谊校区对照）。
    // 友谊校区作息不同且分冬夏令（上午 8:00 起、下午冬季 14:00 / 夏季 14:30 起），在此校区的用户请反馈或用自定义作息。
    {
    id: "nwpu",
    school: "西北工业大学",
    variant: "长安校区",
    kind: "period",
    rows: [
      { period: 1, start: "08:30", end: "09:15" },
      { period: 2, start: "09:25", end: "10:10" },
      { period: 3, start: "10:30", end: "11:15" },
      { period: 4, start: "11:25", end: "12:10" },
      { period: 5, start: "12:20", end: "13:05" },
      { period: 6, start: "13:05", end: "13:50" },
      { period: 7, start: "14:00", end: "14:45" },
      { period: 8, start: "14:55", end: "15:40" },
      { period: 9, start: "16:00", end: "16:45" },
      { period: 10, start: "16:55", end: "17:40" },
      { period: 11, start: "19:00", end: "19:45" },
      { period: 12, start: "19:55", end: "20:40" },
      { period: 13, start: "20:40", end: "21:25" },
    ],
  },
    // 华南理工大学：11 小节制（五山校区）。
    // 来源：教务处官方作息页索引快照 + 学生手册双源逐字一致（2026-09 核实）。
    // 大学城校区/广州国际校区为另一套（第 1 节 8:50 起、下午 14:00 起），该校区用户请反馈或用自定义作息。
    {
    id: "scut",
    school: "华南理工大学",
    variant: "五山校区",
    kind: "period",
    rows: [
      { period: 1, start: "08:00", end: "08:45" },
      { period: 2, start: "08:55", end: "09:40" },
      { period: 3, start: "10:00", end: "10:45" },
      { period: 4, start: "10:55", end: "11:40" },
      { period: 5, start: "14:30", end: "15:15" },
      { period: 6, start: "15:25", end: "16:10" },
      { period: 7, start: "16:20", end: "17:05" },
      { period: 8, start: "17:15", end: "18:00" },
      { period: 9, start: "19:00", end: "19:45" },
      { period: 10, start: "19:55", end: "20:40" },
      { period: 11, start: "20:50", end: "21:35" },
    ],
  },
    // 暨南大学：13 小节制（石牌校本部/珠海校区）。
    // 来源：本科生院官网《暨南大学各校区上课时间表》官方 docx（jwc.jnu.edu.cn，2021-08 发布，2026-09 解析）。
    // 特色：第 5 节从 12:40 开始。华文/番禺校区（8:30 起）与深圳校区（13:30 起）作息不同，请反馈或用自定义作息。
    {
    id: "jnu",
    school: "暨南大学",
    kind: "period",
    rows: [
      { period: 1, start: "08:00", end: "08:45" },
      { period: 2, start: "08:55", end: "09:40" },
      { period: 3, start: "10:00", end: "10:45" },
      { period: 4, start: "10:55", end: "11:40" },
      { period: 5, start: "12:40", end: "13:25" },
      { period: 6, start: "13:35", end: "14:20" },
      { period: 7, start: "14:30", end: "15:15" },
      { period: 8, start: "15:25", end: "16:10" },
      { period: 9, start: "16:20", end: "17:05" },
      { period: 10, start: "17:15", end: "18:00" },
      { period: 11, start: "19:00", end: "19:45" },
      { period: 12, start: "19:55", end: "20:40" },
      { period: 13, start: "20:50", end: "21:35" },
    ],
  },
    // 华东理工大学：12 小节制。来源：教务处官网「校历与上课时间表」内嵌官方 PDF
    // （jwc.ecust.edu.cn，2026-09 解析原文）。单一官方文件即权威；下午 13:30 起、晚上 18:00 起。
    {
    id: "ecust",
    school: "华东理工大学",
    kind: "period",
    rows: [
      { period: 1, start: "08:00", end: "08:45" },
      { period: 2, start: "08:55", end: "09:40" },
      { period: 3, start: "09:55", end: "10:40" },
      { period: 4, start: "10:50", end: "11:35" },
      { period: 5, start: "13:30", end: "14:15" },
      { period: 6, start: "14:25", end: "15:10" },
      { period: 7, start: "15:25", end: "16:10" },
      { period: 8, start: "16:20", end: "17:05" },
      { period: 9, start: "18:00", end: "18:45" },
      { period: 10, start: "18:50", end: "19:35" },
      { period: 11, start: "19:45", end: "20:30" },
      { period: 12, start: "20:35", end: "21:20" },
    ],
  },
    // 南京航空航天大学：11 小节制（将军路/明故宫校区，每节 50 分钟）。
    // 来源：教务处官网校历（aao.nuaa.edu.cn，2025-08-28 发布，2026-09 抓取 + 摘要互证）。
    // 天目湖校区作息不同（8:30 起），该校区用户请反馈或用自定义作息。
    {
    id: "nuaa",
    school: "南京航空航天大学",
    kind: "period",
    rows: [
      { period: 1, start: "08:00", end: "08:50" },
      { period: 2, start: "08:55", end: "09:45" },
      { period: 3, start: "10:15", end: "11:05" },
      { period: 4, start: "11:10", end: "12:00" },
      { period: 5, start: "14:00", end: "14:50" },
      { period: 6, start: "14:55", end: "15:45" },
      { period: 7, start: "16:15", end: "17:05" },
      { period: 8, start: "17:10", end: "18:00" },
      { period: 9, start: "18:45", end: "19:35" },
      { period: 10, start: "19:40", end: "20:30" },
      { period: 11, start: "20:35", end: "21:25" },
    ],
  },
    // 西安电子科技大学：11 小节制（冬春季作息，国庆至次年劳动节）。
    // 来源：集成电路学部官网「作息时间」（sme.xidian.edu.cn，含冬春/夏秋两套，2026-09 全文抓取）。
    // 夏秋季（劳动节至国庆）下午自 14:30 起、晚上自 19:30 起顺延 30 分钟；北校区第 7-8 节早 10 分钟。
    {
    id: "xidian",
    school: "西安电子科技大学",
    variant: "冬春季作息",
    kind: "period",
    rows: [
      { period: 1, start: "08:30", end: "09:15" },
      { period: 2, start: "09:20", end: "10:05" },
      { period: 3, start: "10:25", end: "11:10" },
      { period: 4, start: "11:15", end: "12:00" },
      { period: 5, start: "14:00", end: "14:45" },
      { period: 6, start: "14:50", end: "15:35" },
      { period: 7, start: "15:55", end: "16:40" },
      { period: 8, start: "16:45", end: "17:30" },
      { period: 9, start: "19:00", end: "19:45" },
      { period: 10, start: "19:50", end: "20:35" },
      { period: 11, start: "20:40", end: "21:25" },
    ],
  },
    // 北京邮电大学：14 小节制（校本部与沙河校区统一，2019-2020 学年起施行）。
    // 来源：教务处《关于调整教学时间的通知》（jwc.bupt.edu.cn）+ BYR Docs 新生指南完整表
    // （guide.byrdocs.org，2026-09 抓取）+ 研究生院课表通知佐证。第 12-14 节一般留给公选课。
    {
    id: "bupt",
    school: "北京邮电大学",
    kind: "period",
    rows: [
      { period: 1, start: "08:00", end: "08:45" },
      { period: 2, start: "08:50", end: "09:35" },
      { period: 3, start: "09:50", end: "10:35" },
      { period: 4, start: "10:40", end: "11:25" },
      { period: 5, start: "11:30", end: "12:15" },
      { period: 6, start: "13:00", end: "13:45" },
      { period: 7, start: "13:50", end: "14:35" },
      { period: 8, start: "14:45", end: "15:30" },
      { period: 9, start: "15:40", end: "16:25" },
      { period: 10, start: "16:35", end: "17:20" },
      { period: 11, start: "17:25", end: "18:10" },
      { period: 12, start: "18:30", end: "19:15" },
      { period: 13, start: "19:20", end: "20:05" },
      { period: 14, start: "20:10", end: "20:55" },
    ],
  },
    // 上海大学：11 小节制（三学期制，节次时间各学期统一）。
    // 来源：教务处官方校历上课时间表（bksy.shu.edu.cn，2023-2024 学年）+ 2026-2027 学年校历转载一致。
    {
    id: "shu",
    school: "上海大学",
    kind: "period",
    rows: [
      { period: 1, start: "08:00", end: "08:45" },
      { period: 2, start: "08:55", end: "09:40" },
      { period: 3, start: "10:00", end: "10:45" },
      { period: 4, start: "10:55", end: "11:40" },
      { period: 5, start: "13:00", end: "13:45" },
      { period: 6, start: "13:55", end: "14:40" },
      { period: 7, start: "15:00", end: "15:45" },
      { period: 8, start: "15:55", end: "16:40" },
      { period: 9, start: "18:00", end: "18:45" },
      { period: 10, start: "18:55", end: "19:40" },
      { period: 11, start: "20:00", end: "20:45" },
    ],
  },
    // 中国农业大学：11 小节制（每节 50 分钟）。
    // 来源：本科生院官网「查询服务·上课节次时间表」（jwc.cau.edu.cn 现行公布页）。
    // 第 7/8/11 节的结束时间按每节 50 分钟规律补全（官方摘要截断），如与实际打铃时间不符请反馈。
    {
    id: "cau",
    school: "中国农业大学",
    kind: "period",
    rows: [
      { period: 1, start: "08:00", end: "08:50" },
      { period: 2, start: "09:00", end: "09:50" },
      { period: 3, start: "10:10", end: "11:00" },
      { period: 4, start: "11:10", end: "12:00" },
      { period: 5, start: "14:00", end: "14:50" },
      { period: 6, start: "15:00", end: "15:50" },
      { period: 7, start: "16:10", end: "17:00" },
      { period: 8, start: "17:10", end: "18:00" },
      { period: 9, start: "19:00", end: "19:50" },
      { period: 10, start: "20:00", end: "20:50" },
      { period: 11, start: "21:00", end: "21:50" },
    ],
  },
    // 南京理工大学：13 小节制。来源：环境与生物工程学院官方校历页搜索摘要逐节拼合
    // （ebe.njust.edu.cn，2014-2015 校历），经校官网新闻「每节 45 分钟、上午 3+2 节、下午 2+3 节」互证；
    // 第 13 节结束时间按 45 分钟推算。教务处页面反爬无法直接抓取，使用前建议以最新校历复核。
    {
    id: "njust",
    school: "南京理工大学",
    kind: "period",
    rows: [
      { period: 1, start: "08:00", end: "08:45" },
      { period: 2, start: "08:50", end: "09:35" },
      { period: 3, start: "09:40", end: "10:25" },
      { period: 4, start: "10:40", end: "11:25" },
      { period: 5, start: "11:30", end: "12:15" },
      { period: 6, start: "14:00", end: "14:45" },
      { period: 7, start: "14:50", end: "15:35" },
      { period: 8, start: "15:50", end: "16:35" },
      { period: 9, start: "16:40", end: "17:25" },
      { period: 10, start: "17:30", end: "18:15" },
      { period: 11, start: "19:00", end: "19:45" },
      { period: 12, start: "19:50", end: "20:35" },
      { period: 13, start: "20:40", end: "21:25" },
    ],
  },
    // 合肥工业大学：12 小节制（合肥校区）。来源：引用教务处官方校历的学生维基
    // （survive-hfut.cc，两次抓取一致）+ 校内作息通知旁证（下午 14:00 起）；
    // 官方校历原文需校内权限，节次明细未能直接核到官方原文，如有出入请反馈。
    {
    id: "hfut",
    school: "合肥工业大学",
    kind: "period",
    rows: [
      { period: 1, start: "08:00", end: "08:45" },
      { period: 2, start: "08:55", end: "09:40" },
      { period: 3, start: "10:00", end: "10:45" },
      { period: 4, start: "10:55", end: "11:40" },
      { period: 5, start: "14:00", end: "14:45" },
      { period: 6, start: "14:55", end: "15:40" },
      { period: 7, start: "15:50", end: "16:35" },
      { period: 8, start: "16:45", end: "17:30" },
      { period: 9, start: "17:40", end: "18:25" },
      { period: 10, start: "19:20", end: "20:05" },
      { period: 11, start: "20:15", end: "21:00" },
      { period: 12, start: "21:10", end: "21:55" },
    ],
  },
    // 湖南大学：12 小节制。来源：教育科学研究院课表页脚作息（edu.hnu.edu.cn），
    // 上午与晚间关键节点经教务处现行课表通知印证；下午/深夜节次取自较旧页面，
    // 教务处每学期《上下课打铃时间表》附件需验证码未能抓取，如与实际不符请反馈。
    {
    id: "hnu",
    school: "湖南大学",
    kind: "period",
    rows: [
      { period: 1, start: "08:00", end: "08:45" },
      { period: 2, start: "08:55", end: "09:40" },
      { period: 3, start: "10:00", end: "10:45" },
      { period: 4, start: "10:55", end: "11:40" },
      { period: 5, start: "14:30", end: "15:15" },
      { period: 6, start: "15:15", end: "16:00" },
      { period: 7, start: "16:10", end: "16:55" },
      { period: 8, start: "16:55", end: "17:40" },
      { period: 9, start: "19:00", end: "19:45" },
      { period: 10, start: "19:55", end: "20:40" },
      { period: 11, start: "20:50", end: "21:35" },
      { period: 12, start: "21:35", end: "22:20" },
    ],
  },
    // 西南大学：12 小节制（北碚主校区，每节 40 分钟）。
    // 来源：研究生院官方公共课课表（pgs.swu.edu.cn）印证第 1-3 节 + 全节次流传表拼合；
    // 下午 14:30 起与校办暑期值班时间互证。本科生院校历为图片无法文本核验，如与实际不符请反馈。
    {
    id: "swu",
    school: "西南大学",
    kind: "period",
    rows: [
      { period: 1, start: "08:00", end: "08:40" },
      { period: 2, start: "08:50", end: "09:30" },
      { period: 3, start: "09:40", end: "10:20" },
      { period: 4, start: "10:30", end: "11:10" },
      { period: 5, start: "11:20", end: "12:00" },
      { period: 6, start: "14:30", end: "15:10" },
      { period: 7, start: "15:20", end: "16:00" },
      { period: 8, start: "16:10", end: "16:50" },
      { period: 9, start: "17:00", end: "17:40" },
      { period: 10, start: "19:00", end: "19:40" },
      { period: 11, start: "19:50", end: "20:30" },
      { period: 12, start: "20:40", end: "21:20" },
    ],
  },
    // 武汉理工大学：13 小节制（上午 5 节、下午 5 节、晚上 3 节）。
    // 来源：校内新生问答官方页（amucwut.whut.edu.cn，确认 13 学时与第 1 节 8:00-8:45、
    // 第 8 节 15:40-16:25 两个锚点），其余节次按每节 45 分钟 + 标准课间推算，如与实际不符请反馈。
    {
    id: "wut",
    school: "武汉理工大学",
    kind: "period",
    rows: [
      { period: 1, start: "08:00", end: "08:45" },
      { period: 2, start: "08:50", end: "09:35" },
      { period: 3, start: "09:55", end: "10:40" },
      { period: 4, start: "10:45", end: "11:30" },
      { period: 5, start: "11:35", end: "12:20" },
      { period: 6, start: "14:00", end: "14:45" },
      { period: 7, start: "14:50", end: "15:35" },
      { period: 8, start: "15:40", end: "16:25" },
      { period: 9, start: "16:30", end: "17:15" },
      { period: 10, start: "17:20", end: "18:05" },
      { period: 11, start: "18:30", end: "19:15" },
      { period: 12, start: "19:20", end: "20:05" },
      { period: 13, start: "20:10", end: "20:55" },
    ],
  },
    // 北京理工大学：13 小节制（2014-09 起「全天 13 小节排课制」，良乡/中关村同表）。
    // 来源：教务部教学日历收录片段（jwb.bit.edu.cn，第四小节 10:45-11:30、下午 13:20-14:05 等逐节）
    // + BIT101 校园应用默认时间表双端交叉印证 + 官网通知「晚上 21:00 前下课」自洽。
    {
    id: "bit",
    school: "北京理工大学",
    kind: "period",
    rows: [
      { period: 1, start: "08:00", end: "08:45" },
      { period: 2, start: "08:50", end: "09:35" },
      { period: 3, start: "09:55", end: "10:40" },
      { period: 4, start: "10:45", end: "11:30" },
      { period: 5, start: "11:35", end: "12:20" },
      { period: 6, start: "13:20", end: "14:05" },
      { period: 7, start: "14:10", end: "14:55" },
      { period: 8, start: "15:15", end: "16:00" },
      { period: 9, start: "16:05", end: "16:50" },
      { period: 10, start: "16:55", end: "17:40" },
      { period: 11, start: "18:30", end: "19:15" },
      { period: 12, start: "19:20", end: "20:05" },
      { period: 13, start: "20:10", end: "20:55" },
    ],
  },
    // 大连理工大学：12 小节制（凌水主校区）。
    // 来源：两个独立的教务系统课表适配器第 1-8 节完全一致（自注与 jxgl.dlut.edu.cn 官方 layout 一致），
    // 晚间第 11 节 19:40-20:25 另获文库作息表印证；晚间起始存在 18:00 / 18:30 两种口径，如不符请反馈。
    // 开发区（软件）校区与盘锦校区作息不同，请用自定义作息。
    {
    id: "dlut",
    school: "大连理工大学",
    kind: "period",
    rows: [
      { period: 1, start: "08:00", end: "08:45" },
      { period: 2, start: "08:50", end: "09:35" },
      { period: 3, start: "10:05", end: "10:50" },
      { period: 4, start: "10:55", end: "11:40" },
      { period: 5, start: "13:30", end: "14:15" },
      { period: 6, start: "14:20", end: "15:05" },
      { period: 7, start: "15:35", end: "16:20" },
      { period: 8, start: "16:25", end: "17:10" },
      { period: 9, start: "18:00", end: "18:45" },
      { period: 10, start: "18:50", end: "19:35" },
      { period: 11, start: "19:40", end: "20:25" },
      { period: 12, start: "20:30", end: "21:15" },
    ],
  },
    // 东北大学：12 小节制（浑南校区，现行本科生主校区）。
    // 来源：浑南萌新入学指南（学生会）+ 课表应用适配工具 HUNNAN_TIMES 双源一致；
    // 南湖校区仅上午不同（8:00-8:45 / 8:55-9:40 / 10:00-10:45 / 10:55-11:40），该校区用户请反馈。
    {
    id: "neu",
    school: "东北大学",
    variant: "浑南校区",
    kind: "period",
    rows: [
      { period: 1, start: "08:30", end: "09:15" },
      { period: 2, start: "09:25", end: "10:10" },
      { period: 3, start: "10:30", end: "11:15" },
      { period: 4, start: "11:25", end: "12:10" },
      { period: 5, start: "14:00", end: "14:45" },
      { period: 6, start: "14:55", end: "15:40" },
      { period: 7, start: "16:00", end: "16:45" },
      { period: 8, start: "16:55", end: "17:40" },
      { period: 9, start: "18:30", end: "19:15" },
      { period: 10, start: "19:25", end: "20:10" },
      { period: 11, start: "20:20", end: "21:05" },
      { period: 12, start: "21:15", end: "22:00" },
    ],
  },
    // 中国海洋大学：12 小节制（崂山/鱼山校区，每节 50 分钟）。
    // 来源：教务处《各校区作息时间表》官方 PDF（jwc.ouc.edu.cn，2022-09 发布，2026-09 直接解析原文）。
    // 西海岸校区上午为 8:30 起（9:25-10:15 / 10:30-11:20 / 11:25-12:15），下午与晚上三校区相同。
    {
    id: "ouc",
    school: "中国海洋大学",
    kind: "period",
    rows: [
      { period: 1, start: "08:00", end: "08:50" },
      { period: 2, start: "09:00", end: "09:50" },
      { period: 3, start: "10:10", end: "11:00" },
      { period: 4, start: "11:10", end: "12:00" },
      { period: 5, start: "13:30", end: "14:20" },
      { period: 6, start: "14:30", end: "15:20" },
      { period: 7, start: "15:30", end: "16:20" },
      { period: 8, start: "16:30", end: "17:20" },
      { period: 9, start: "17:30", end: "18:20" },
      { period: 10, start: "18:30", end: "19:20" },
      { period: 11, start: "19:30", end: "20:20" },
      { period: 12, start: "20:30", end: "21:20" },
    ],
  },
    // 哈尔滨工程大学：13 小节制（上午 5 节、下午 5 节、晚上 3 节，每节 45 分钟）。
    // 来源：本科生院官方统一打铃时刻（ugs.hrbeu.edu.cn，13 个锚点）与教务系统课表适配脚本
    // 逐节一一对应（github.com/kuailiaojie/classtable HRBEU），完全自洽。
    {
    id: "heu",
    school: "哈尔滨工程大学",
    kind: "period",
    rows: [
      { period: 1, start: "08:00", end: "08:45" },
      { period: 2, start: "08:50", end: "09:35" },
      { period: 3, start: "09:55", end: "10:40" },
      { period: 4, start: "10:45", end: "11:30" },
      { period: 5, start: "11:35", end: "12:20" },
      { period: 6, start: "13:30", end: "14:15" },
      { period: 7, start: "14:20", end: "15:05" },
      { period: 8, start: "15:25", end: "16:10" },
      { period: 9, start: "16:15", end: "17:00" },
      { period: 10, start: "17:05", end: "17:50" },
      { period: 11, start: "18:30", end: "19:15" },
      { period: 12, start: "19:20", end: "20:05" },
      { period: 13, start: "20:10", end: "20:55" },
    ],
  },
    // 郑州大学：10 小节制（主校区，一天最多 5 个大节 1-2/3-4/5-6/7-8/9-10，全年统一无夏冬令）。
    // 来源：校长办公室多份通知明确教学窗口（上午 8:00—11:40、下午 14:10—17:50、晚上 19:00—20:40），
    // 节次按 45 分钟节长推定且与真实课表五个大节结构吻合；社区流传的另一套 12 节表与官方窗口冲突，未采纳。
    {
    id: "zzu",
    school: "郑州大学",
    kind: "period",
    rows: [
      { period: 1, start: "08:00", end: "08:45" },
      { period: 2, start: "08:55", end: "09:40" },
      { period: 3, start: "10:00", end: "10:45" },
      { period: 4, start: "10:55", end: "11:40" },
      { period: 5, start: "14:10", end: "14:55" },
      { period: 6, start: "15:05", end: "15:50" },
      { period: 7, start: "16:10", end: "16:55" },
      { period: 8, start: "17:05", end: "17:50" },
      { period: 9, start: "19:00", end: "19:45" },
      { period: 10, start: "19:55", end: "20:40" },
    ],
  },
    // 苏州大学：11 小节制（每节 50 分钟，全校统一）。
    // 来源：第 1-8 节为海外教育学院官方上课时间表 PDF + 材料与化学化工学部公开课安排双源印证；
    // 晚间 9-11 节按 2013 年报道的晚上教学时段 18:00-20:50 + 50 分钟节长推算，如不符请反馈。
    {
    id: "suda",
    school: "苏州大学",
    kind: "period",
    rows: [
      { period: 1, start: "08:00", end: "08:50" },
      { period: 2, start: "09:00", end: "09:50" },
      { period: 3, start: "10:10", end: "11:00" },
      { period: 4, start: "11:10", end: "12:00" },
      { period: 5, start: "13:30", end: "14:20" },
      { period: 6, start: "14:30", end: "15:20" },
      { period: 7, start: "15:40", end: "16:30" },
      { period: 8, start: "16:40", end: "17:30" },
      { period: 9, start: "18:00", end: "18:50" },
      { period: 10, start: "19:00", end: "19:50" },
      { period: 11, start: "20:00", end: "20:50" },
    ],
  },
    // 中央民族大学：12 小节制（每节 45 分钟）。
    // 来源：教务处《关于丰台校区各教学楼上下课时间的通知》（jw.muc.edu.cn，2026-03）+ 2017 本科公开课表
    // + 海南陵水试验区入驻高校统一节次表，多源逐分钟自洽。
    // 注意：丰台校区部分教学楼（致远/明德/博文/崇理）第 3 节起错峰顺延 15 分钟，如上课时间不符请反馈。
    {
    id: "muc",
    school: "中央民族大学",
    kind: "period",
    rows: [
      { period: 1, start: "08:00", end: "08:45" },
      { period: 2, start: "08:50", end: "09:35" },
      { period: 3, start: "09:50", end: "10:35" },
      { period: 4, start: "10:40", end: "11:25" },
      { period: 5, start: "11:30", end: "12:15" },
      { period: 6, start: "14:00", end: "14:45" },
      { period: 7, start: "14:50", end: "15:35" },
      { period: 8, start: "15:50", end: "16:35" },
      { period: 9, start: "16:40", end: "17:25" },
      { period: 10, start: "17:30", end: "18:15" },
      { period: 11, start: "19:00", end: "19:45" },
      { period: 12, start: "19:50", end: "20:35" },
    ],
  },
];

const PRESETS: Record<string, SchedulePreset> = Object.fromEntries(
  [PKU_SCHEDULE, UIBE_SCHEDULE, ...A_CLASS_PRESETS].map((preset) => [preset.id, preset]),
);

/** 未选择学校时的回落预设（= 北大） */
export const DEFAULT_SCHEDULE = PKU_SCHEDULE;

/** API 负载里携带的作息快照（含自定义作息的行），客户端渲染网格用 */
export interface ScheduleDTO {
  id: string;
  school: string;
  variant?: string;
  kind: "period" | "block";
  rows: ScheduleRow[];
  blocks?: ScheduleBlock[];
}

export function toScheduleDTO(preset: SchedulePreset): ScheduleDTO {
  return { id: preset.id, school: preset.school, variant: preset.variant, kind: preset.kind, rows: preset.rows, blocks: preset.blocks };
}

/** 学期行的作息解析：custom_schedule 优先，否则按 scheduleId 查注册表 */
export function scheduleFromSemester(input: {
  scheduleId?: string | null;
  customSchedule?: { start: string; end: string }[] | null;
  school?: string | null;
}): ScheduleDTO {
  if (input.scheduleId === "custom") {
    if (input.customSchedule?.length) {
      return {
        id: "custom",
        school: "自定义作息",
        kind: "period",
        rows: input.customSchedule.map((row, index) => ({ period: index + 1, start: row.start, end: row.end })),
      };
    }
    // 选了「其他学校」但还没填写作息时间表：暂按默认节次显示，名称如实标注。
    return { ...toScheduleDTO(getScheduleById(null)), school: "其他学校（未设置作息，暂按默认节次）" };
  }
  return toScheduleDTO(getScheduleById(input.scheduleId));
}

/** 自定义作息行的服务端校验：1–16 行、时间合法且单调不重叠 */
export function validateCustomRows(rows: { start: string; end: string }[]): { ok: boolean; message?: string } {
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > MAX_PERIOD_COUNT) {
    return { ok: false, message: "自定义作息需要 1–16 节" };
  }
  let previousEnd = -1;
  for (const row of rows) {
    if (!/^\d{1,2}:\d{2}$/.test(row.start) || !/^\d{1,2}:\d{2}$/.test(row.end)) return { ok: false, message: "时间格式应为 HH:MM" };
    const start = toMinutesLocal(row.start);
    const end = toMinutesLocal(row.end);
    if (end <= start) return { ok: false, message: "结束时间必须晚于开始时间" };
    if (start < previousEnd) return { ok: false, message: "节次时间必须递增且不重叠" };
    previousEnd = end;
  }
  return { ok: true };
}

function toMinutesLocal(hhmm: string) {
  const [hours, minutes] = hhmm.split(":").map(Number);
  return hours * 60 + minutes;
}

/** 全部预设，供导入页学校选择器使用（按 school 名排序展示） */
export function listSchedulePresets(): SchedulePreset[] {
  return Object.values(PRESETS).sort((a, b) => a.school.localeCompare(b.school, "zh-Hans-CN"));
}

/** scheduleId 为空或未知时回落到北大默认，保证存量用户与旧数据零感知 */
export function getScheduleById(scheduleId?: string | null): SchedulePreset {
  if (!scheduleId) return PKU_SCHEDULE;
  return PRESETS[scheduleId] ?? PKU_SCHEDULE;
}

export function getScheduleForSemester(semester?: { scheduleId?: string | null } | null): SchedulePreset {
  return getScheduleById(semester?.scheduleId);
}

export function schedulePeriodCount(schedule: { rows: ScheduleRow[] }): number {
  return schedule.rows.length;
}

function toMinutes(hhmm: string) {
  const [hours, minutes] = hhmm.split(":").map(Number);
  return hours * 60 + minutes;
}

/** 连续节次的实际起止时间；节次越界时返回 null */
export function periodRangeIn(schedule: { rows: ScheduleRow[] }, startPeriod: number, endPeriod: number): { start: string; end: string } | null {
  const first = schedule.rows[startPeriod - 1];
  const last = schedule.rows[endPeriod - 1];
  if (!first || !last) return null;
  return { start: first.start, end: last.end };
}

export function periodRangeMinutesIn(schedule: { rows: ScheduleRow[] }, startPeriod: number, endPeriod: number): { startMin: number; endMin: number } | null {
  const range = periodRangeIn(schedule, startPeriod, endPeriod);
  if (!range) return null;
  return { startMin: toMinutes(range.start), endMin: toMinutes(range.end) };
}

export interface PeriodChoice { value: string; label: string }

function labelForRow(rows: ScheduleRow[], blocks: ScheduleBlock[] | undefined, index: number): string {
  const period = index + 1;
  const row = rows[index];
  const block = blocks?.find((item) => period >= item.from && period <= item.to);
  if (block) return block.label + " " + row.start + "–" + row.end;
  return "第 " + period + " 节 " + row.start + "–" + row.end;
}

/** 编辑器的「开始节次」选项（带时间与大节上下文） */
export function buildPeriodOptions(schedule: { rows: ScheduleRow[]; blocks?: ScheduleBlock[] }): PeriodChoice[] {
  return schedule.rows.map((_, index) => ({ value: String(index + 1), label: labelForRow(schedule.rows, schedule.blocks, index) }));
}

/** 编辑器的「结束节次」选项：不早于开始节次 */
export function buildEndOptions(schedule: { rows: ScheduleRow[]; blocks?: ScheduleBlock[] }, startPeriod: number): PeriodChoice[] {
  return schedule.rows
    .map((_, index) => ({ value: String(index + 1), label: labelForRow(schedule.rows, schedule.blocks, index) }))
    .filter((choice) => Number(choice.value) >= startPeriod);
}
