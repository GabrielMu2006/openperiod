import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import * as SheetJS from "xlsx";
import { UIBE_SCHEDULE } from "@/src/config/school-schedules";
import { parseWorkbookSheets, PkuExcelImporter } from "./pku-excel";


describe("PkuExcelImporter", () => {
  it("detects the official template", async () => {
    const file = await readFile("public/OpenPeriod-PKU-Template.xlsx");
    const input = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
    await expect(new PkuExcelImporter().detect(input)).resolves.toMatchObject({ supported: true, format: "ROW" });
  });

  it("parses legacy .xls (BIFF8) workbooks", async () => {
    const workbook = SheetJS.utils.book_new();
    SheetJS.utils.book_append_sheet(workbook, SheetJS.utils.aoa_to_sheet([
      ["Course", "Teacher", "Location", "Weekday", "StartPeriod", "EndPeriod", "Weeks"],
      ["古代汉语", "王教授", "一教101", "周一", 1, 2, "1-16"],
      ["古代汉语", "王教授", "一教101", "周三", 3, 4, "单周"],
    ]), "课程");
    const buffer = SheetJS.write(workbook, { bookType: "biff8", type: "buffer" }) as Buffer;
    const input = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;

    const importer = new PkuExcelImporter();
    await expect(importer.detect(input)).resolves.toMatchObject({ supported: true, format: "ROW" });
    const payload = await importer.parse(input);
    expect(payload.stats).toEqual({ courseCount: 1, meetingCount: 2, warningCount: 0 });
    expect(payload.courses[0].name).toBe("古代汉语");
    expect(payload.courses[0].meetings[1]).toMatchObject({ weekday: "wednesday", startPeriod: 3, endPeriod: 4 });
  });

  it("parses the PKU jw-system grid export with exam-note cells", () => {
    const cell = (name: string, location: string, exam: string) => `${name}(${location})(备注：) ${exam}`;
    const result = parseWorkbookSheets([{ sheet: "new sheet", data: [
      ["节数", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"],
      ["第一节", cell("可视计算与交互概论", "理教108", "每周考试方式：堂考、论文、或统一时间考试"), "", "", "", "", "", ""],
      ["第二节", cell("可视计算与交互概论", "理教108", "每周考试方式：堂考、论文、或统一时间考试"), "", "", "", "", "", ""],
      ["第三节", "", "", "", "", "", "", ""],
      ["第四节", "", "", "", "", "", "", ""],
      ["第五节", "计算机系统导论(理教402)(备注：小班课上课时间：每周三10-11节课。请选大班的同学空出小班上课时间，小班会手动添加，冲突选课无法添加。) 每周考试时间：20261228下午；", "", "", "", "", "", ""],
      ["第六节", "计算机系统导论(理教402)(备注：小班课上课时间：每周三10-11节课。请选大班的同学空出小班上课时间，小班会手动添加，冲突选课无法添加。) 每周考试时间：20261228下午；", "", "", "", "", "", ""],
      ["第七节", "", "", "", "", "", "", ""],
      ["第八节", "", "", "", "", "", "", ""],
      ["第九节", "", "", "", "", "", "", ""],
      ["第十节", "", cell("计算机视觉", "二教101", "双周考试方式：堂考、论文、或统一时间考试"), "", "", "", "", ""],
      ["第十一节", "", cell("计算机视觉", "二教101", "双周考试方式：堂考、论文、或统一时间考试"), "", "", "", "", ""],
    ] }]);

    expect(result.format).toBe("GRID");
    expect(result.stats.warningCount).toBe(0);
    const byName = Object.fromEntries(result.courses.map((course) => [course.name, course]));

    expect(byName["可视计算与交互概论"]).toMatchObject({ location: "理教108" });
    expect(byName["可视计算与交互概论"].meetings).toHaveLength(1);
    expect(byName["可视计算与交互概论"].meetings[0]).toMatchObject({ weekday: "monday", startPeriod: 1, endPeriod: 2 });

    // 备注里的“每周三10-11节课”和考试日期不能污染周次
    expect(byName["计算机系统导论"].meetings[0]).toMatchObject({ startPeriod: 5, endPeriod: 6 });
    expect(byName["计算机系统导论"].meetings[0].weeks).toEqual(Array.from({ length: 16 }, (_, index) => index + 1));

    expect(byName["计算机视觉"].meetings[0]).toMatchObject({ weekday: "tuesday", startPeriod: 10, endPeriod: 11 });
    expect(byName["计算机视觉"].meetings[0].weeks).toEqual([2, 4, 6, 8, 10, 12, 14, 16]);
  });

  it("explains an unfilled template instead of rejecting the format", () => {
    expect(() => parseWorkbookSheets([{ sheet: "课程", data: [
      ["Course", "Teacher", "Location", "Weekday", "StartPeriod", "EndPeriod", "Weeks"],
      [null, null, null, null, null, null, null],
    ] }])).toThrow("没有读到课程行");
  });

  it("normalizes repeated course rows into meetings", () => {
    const result = parseWorkbookSheets([{ sheet: "课程", data: [
      ["Course", "Teacher", "Location", "Weekday", "StartPeriod", "EndPeriod", "Weeks"],
      ["计量经济学", "张老师", "二教203", "周二", 5, 6, "单周"],
      ["计量经济学", "张老师", "二教203", "周四", 7, 8, "1-16周"],
    ] }]);
    expect(result.stats).toEqual({ courseCount: 1, meetingCount: 2, warningCount: 0 });
    expect(result.courses[0].meetings[0].weeks).toEqual([1, 3, 5, 7, 9, 11, 13, 15]);
    expect(result.courses[0].meetings[1]).toMatchObject({ weekday: "thursday", startPeriod: 7, endPeriod: 8 });
  });

  it("parses a timetable grid and reports uncertain weeks", () => {
    const result = parseWorkbookSheets([{ sheet: "课表", data: [
      ["节次", "周一", "周二", "周三", "周四", "周五"],
      ["1-2", "高等数学\n1-16周", null, null, "大学英语", null],
    ] }]);

    expect(result.format).toBe("GRID");
    expect(result.stats).toEqual({ courseCount: 2, meetingCount: 2, warningCount: 1 });
    expect(result.courses[0].meetings[0]).toMatchObject({ weekday: "monday", startPeriod: 1, endPeriod: 2 });
    expect(result.warnings[0]).toMatchObject({ code: "MISSING_WEEKS", source: "课表 / E2" });
  });

  it("expands UIBE 大节 rows into small periods", () => {
    const result = parseWorkbookSheets([{ sheet: "课表", data: [
      ["课程名称", "教师", "地点", "星期", "大节", "节数", "周次"],
      ["国际贸易", "王老师", "宁远楼 305", "周一", 1, "", "1-16"],
      ["国际贸易", "王老师", "宁远楼 305", "周三", "第二大节", 3, "1-16"],
      ["金融学", "李老师", "博学楼 402", "周五", 5, 2, "1-16"],
    ] }], UIBE_SCHEDULE);

    expect(result.stats.courseCount).toBe(2);
    const trade = result.courses.find((course) => course.name === "国际贸易");
    expect(trade?.meetings).toHaveLength(2);
    expect(trade?.meetings[0]).toMatchObject({ weekday: "monday", startPeriod: 1, endPeriod: 2 });
    // 第二大节 3 节连上 → 小节 3–5（09:50–12:10）
    expect(trade?.meetings[1]).toMatchObject({ weekday: "wednesday", startPeriod: 3, endPeriod: 5 });
    const finance = result.courses.find((course) => course.name === "金融学");
    // 第五大节 2 节 → 小节 11–12（18:30–20:00）
    expect(finance?.meetings[0]).toMatchObject({ weekday: "friday", startPeriod: 11, endPeriod: 12 });
    expect(result.stats.warningCount).toBe(0);
  });
});
