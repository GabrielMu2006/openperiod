// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => {
  const replace = vi.fn();
  return { replace, router: { replace } };
});
vi.mock("next/navigation", () => ({ useRouter: () => mocks.router }));

import { ImportPreviewEditor } from "./import-preview-editor";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  mocks.replace.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("import preview interaction regression", () => {
  it("keeps a 20-week semester through display, failed confirmation retry and final submission", async () => {
    const user = userEvent.setup();
    const confirmBodies: unknown[] = [];
    let confirmationAttempts = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url === "/api/import/preview/preview-1") return json({ preview: {
        provider: "PKU_EXCEL",
        format: "ROW",
        weekCount: 20,
        courses: [{
          id: "course-1",
          name: "长学期课程",
          meetings: [{
            id: "meeting-1",
            weekday: "monday",
            startPeriod: 1,
            endPeriod: 2,
            weeks: Array.from({ length: 20 }, (_, index) => index + 1),
            source: "QA 测试",
          }],
        }],
        warnings: [],
        stats: { courseCount: 1, meetingCount: 1, warningCount: 0 },
        scheduleId: "pku",
        targetSemester: { academicYear: "2026–2027", semester: "秋季学期" },
      } });
      if (url === "/api/import/confirm") {
        confirmationAttempts += 1;
        confirmBodies.push(JSON.parse(String(init?.body)));
        if (confirmationAttempts === 1) return json({ error: "模拟的临时保存失败" }, 503);
        return json({ imported: { snapshotId: "snapshot-1" } });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }));

    render(<ImportPreviewEditor previewId="preview-1" />);
    const weeksInput = await screen.findByDisplayValue("1-20");
    expect((weeksInput as HTMLInputElement).placeholder).toContain("1-20");

    const confirm = screen.getByRole("button", { name: "确认导入 1 门课程" });
    await user.click(confirm);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("模拟的临时保存失败");
    expect(mocks.replace).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "确认导入 1 门课程" }));
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/schedule?imported=1&snapshot=snapshot-1"));
    expect(confirmBodies).toHaveLength(2);
    for (const body of confirmBodies as { previewId: string; courses: { meetings: { weeks: number[] }[] }[] }[]) {
      expect(body.previewId).toBe("preview-1");
      expect(body.courses[0].meetings[0].weeks).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));
    }
  });
});
