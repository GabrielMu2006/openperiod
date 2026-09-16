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
      { period: 6, start: "14:50", end: "15:35" },
      { period: 7, start: "15:55", end: "16:40" },
      { period: 8, start: "16:45", end: "17:30" },
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
  kind: "period" | "block";
  rows: ScheduleRow[];
  blocks?: ScheduleBlock[];
}

export function toScheduleDTO(preset: SchedulePreset): ScheduleDTO {
  return { id: preset.id, school: preset.school, kind: preset.kind, rows: preset.rows, blocks: preset.blocks };
}

/** 学期行的作息解析：custom_schedule 优先，否则按 scheduleId 查注册表 */
export function scheduleFromSemester(input: {
  scheduleId?: string | null;
  customSchedule?: { start: string; end: string }[] | null;
  school?: string | null;
}): ScheduleDTO {
  if (input.scheduleId === "custom" && input.customSchedule?.length) {
    return {
      id: "custom",
      school: "自定义作息",
      kind: "period",
      rows: input.customSchedule.map((row, index) => ({ period: index + 1, start: row.start, end: row.end })),
    };
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
