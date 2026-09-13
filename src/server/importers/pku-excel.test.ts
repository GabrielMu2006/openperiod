import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseWorkbookSheets, PkuExcelImporter } from "./pku-excel";

describe("PkuExcelImporter", () => {
  it("detects the official template", async () => {
    const file = await readFile("public/OpenPeriod-PKU-Template.xlsx");
    const input = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
    await expect(new PkuExcelImporter().detect(input)).resolves.toMatchObject({ supported: true, format: "ROW" });
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
});
