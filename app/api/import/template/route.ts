import * as SheetJS from "xlsx";
import { getScheduleById } from "@/src/config/school-schedules";
import { errorResponse, HttpError } from "@/src/server/http";

export const runtime = "nodejs";

// 按学校作息预设即时生成标准模板 Excel（含示例行）。
// 北大的静态模板仍保留在 /OpenPeriod-PKU-Template.xlsx，这里同时覆盖所有学校。
export async function GET(request: Request) {
  try {
    const school = new URL(request.url).searchParams.get("school") ?? "pku";
    if (getScheduleById(school).id !== school) throw new HttpError(400, "未知的学校作息");
    const preset = getScheduleById(school);

    const periodHeader = preset.kind === "block" ? ["大节", "节数"] : ["开始节次", "结束节次"];
    const firstExample: (string | number)[] = preset.kind === "block"
      ? ["高等数学", "张三", "教一楼 101", "周一", 1, 2, "1-16"]
      : ["高等数学", "张三", "教一楼 101", "周一", 1, 2, "1-16"];
    const secondExample: (string | number)[] = preset.kind === "block"
      ? ["大学英语", "李四", "博学楼 203", "周三", 2, 3, "1-15"]
      : ["大学英语", "李四", "博学楼 203", "周三", 3, 4, "1-15"];
    const rows: (string | number)[][] = [
      ["课程名称", "教师", "地点", "星期", ...periodHeader, "周次"],
      firstExample,
      secondExample,
    ];
    const worksheet = SheetJS.utils.aoa_to_sheet(rows);
    worksheet["!cols"] = [{ wch: 20 }, { wch: 10 }, { wch: 16 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 12 }];
    const workbook = SheetJS.utils.book_new();
    SheetJS.utils.book_append_sheet(workbook, worksheet, "课表");
    const buffer = SheetJS.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const filename = encodeURIComponent(`课隙标准模板-${preset.school}.xlsx`);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="openperiod-template-${preset.id}.xlsx"; filename*=UTF-8''${filename}`,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
