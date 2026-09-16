"use client";

import { useEffect, useState } from "react";
import { PKU_SCHEDULE, buildEndOptions, buildPeriodOptions } from "@/src/config/school-schedules";
import { ThemedSelect } from "@/components/themed-select";

type Rows = { period?: number; start: string; end: string; label?: string }[];
type Blocks = { label: string; from: number; to: number }[];
export type PeriodMode = "school" | "pku" | "time";

export const periodModeTabs: { key: PeriodMode; label: string }[] = [
  { key: "school", label: "按我校课表" },
  { key: "pku", label: "按北大课表" },
  { key: "time", label: "按时间" },
];

function toMin(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// 时间区间 → 我校网格节次（起止各 ±20 分钟容差）
function ownPeriodsForRange(rows: Rows, startMin: number, endMin: number, tolerance = 20): [number, number] | null {
  let start = -1;
  let end = -1;
  rows.forEach((row, index) => {
    if (start < 0 && Math.abs(toMin(row.start) - startMin) <= tolerance) start = index + 1;
    if (Math.abs(toMin(row.end) - endMin) <= tolerance) end = index + 1;
  });
  if (start < 0 || end < 0 || end < start) return null;
  return [start, end];
}

interface PeriodFieldsProps {
  mode: PeriodMode;
  scheduleInfo?: { rows: Rows; blocks?: Blocks } | null;
  startPeriod: number;
  endPeriod: number;
  onChange: (start: number, end: number) => void;
}

// 单个时段的节次输入：三种模式共享同一存储（我校网格的起止节次号），
// 「按北大课表」「按时间」只决定录入方式，保存前自动换算到我校网格。
export function PeriodFields({ mode, scheduleInfo, startPeriod, endPeriod, onChange }: PeriodFieldsProps) {
  const rows: Rows = scheduleInfo?.rows?.length ? scheduleInfo.rows : PKU_SCHEDULE.rows;
  const blocks: Blocks | undefined = scheduleInfo?.blocks;
  const [pkuStart, setPkuStart] = useState("");
  const [pkuEnd, setPkuEnd] = useState("");
  const [timeStart, setTimeStart] = useState("08:00");
  const [timeEnd, setTimeEnd] = useState("08:45");
  const [hint, setHint] = useState("");

  // 模式/存储值变化时，重算该模式下的显示值
  useEffect(() => {
    if (mode === "school") return;
    const startRow = rows[startPeriod - 1];
    const endRow = rows[endPeriod - 1];
    if (!startRow || !endRow) return;
    if (mode === "time") {
      setTimeStart(startRow.start);
      setTimeEnd(endRow.end);
      setHint("");
      return;
    }
    const ps = PKU_SCHEDULE.rows.findIndex((row) => Math.abs(toMin(row.start) - toMin(startRow.start)) <= 20);
    const pe = PKU_SCHEDULE.rows.findIndex((row) => Math.abs(toMin(row.end) - toMin(endRow.end)) <= 20);
    setPkuStart(ps >= 0 ? String(ps + 1) : "");
    setPkuEnd(pe >= 0 ? String(pe + 1) : "");
    setHint(ps < 0 || pe < 0 ? "当前节次无法用北大节次精确表示，请重新选择" : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, startPeriod, endPeriod]);

  function convertFromRange(startMin: number, endMin: number) {
    const mapped = ownPeriodsForRange(rows, startMin, endMin);
    if (!mapped) {
      setHint("这段时间无法对应到我校作息（±20 分钟内无匹配节次），请调整");
      return;
    }
    setHint("");
    onChange(mapped[0], mapped[1]);
  }

  if (mode === "time") {
    return (
      <div className="period-time-fields">
        <label>开始<input type="time" value={timeStart} onChange={(event) => { setTimeStart(event.target.value); if (timeEnd > event.target.value) convertFromRange(toMin(event.target.value), toMin(timeEnd)); }} /></label>
        <label>结束<input type="time" value={timeEnd} onChange={(event) => { setTimeEnd(event.target.value); if (event.target.value > timeStart) convertFromRange(toMin(timeStart), toMin(event.target.value)); }} /></label>
        {hint && <small className="period-hint">{hint}</small>}
      </div>
    );
  }

  if (mode === "pku") {
    const startNum = Number(pkuStart) || 1;
    return (
      <div className="period-pku-fields">
        <label>北大开始<ThemedSelect searchable value={pkuStart} ariaLabel="北大开始节次" groups={[{ options: buildPeriodOptions(PKU_SCHEDULE) }]} onChange={(next) => { setPkuStart(next); const end = Number(pkuEnd) >= Number(next) ? Number(pkuEnd) : Number(next); setPkuEnd(String(end)); const range = { startMin: toMin(PKU_SCHEDULE.rows[Number(next) - 1].start), endMin: toMin(PKU_SCHEDULE.rows[end - 1].end) }; convertFromRange(range.startMin, range.endMin); }} /></label>
        <label>北大结束<ThemedSelect searchable value={pkuEnd} ariaLabel="北大结束节次" groups={[{ options: buildEndOptions(PKU_SCHEDULE, startNum) }]} onChange={(next) => { setPkuEnd(next); const s = Number(pkuStart) || 1; const range = { startMin: toMin(PKU_SCHEDULE.rows[s - 1].start), endMin: toMin(PKU_SCHEDULE.rows[Number(next) - 1].end) }; convertFromRange(range.startMin, range.endMin); }} /></label>
        {hint && <small className="period-hint">{hint}</small>}
      </div>
    );
  }

  return (
    <div className="period-school-fields">
      <label>开始<ThemedSelect searchable value={String(startPeriod)} ariaLabel="开始节次" groups={[{ options: buildPeriodOptions({ rows, blocks }) }]} onChange={(next) => onChange(Number(next), Math.max(Number(next), endPeriod))} /></label>
      <label>结束<ThemedSelect searchable value={String(endPeriod)} ariaLabel="结束节次" groups={[{ options: buildEndOptions({ rows, blocks }, startPeriod) }]} onChange={(next) => onChange(Number(next), Math.max(Number(next), endPeriod))} /></label>
    </div>
  );
}
