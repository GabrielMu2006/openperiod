import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  assertAiExtractionConfigured: vi.fn(),
  consumeAiImportAttempt: vi.fn(),
  extractCoursesWithAi: vi.fn(),
  createImportPreview: vi.fn(),
  ensureDefaultSemester: vi.fn(),
  getUserCustomRows: vi.fn(),
}));

vi.mock("@/src/server/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/src/server/importers/ai-extract", () => ({
  assertAiExtractionConfigured: mocks.assertAiExtractionConfigured,
  extractCoursesWithAi: mocks.extractCoursesWithAi,
}));
vi.mock("@/src/server/importers/ai-quota", () => ({ consumeAiImportAttempt: mocks.consumeAiImportAttempt }));
vi.mock("@/src/server/imports/data", () => ({ createImportPreview: mocks.createImportPreview }));
vi.mock("@/src/server/semesters/data", () => ({
  ensureDefaultSemester: mocks.ensureDefaultSemester,
  getUserCustomRows: mocks.getUserCustomRows,
}));

import { POST } from "@/app/api/import/ai/route";

let userIndex = 0;

beforeEach(() => {
  vi.clearAllMocks();
  userIndex += 1;
  mocks.getCurrentUser.mockResolvedValue({ id: `ai-route-test-${userIndex}`, scheduleId: "pku" });
  mocks.assertAiExtractionConfigured.mockReturnValue(undefined);
  mocks.consumeAiImportAttempt.mockResolvedValue({ limit: 10, resetAt: new Date() });
  mocks.ensureDefaultSemester.mockResolvedValue({ weekCount: 20 });
  mocks.getUserCustomRows.mockResolvedValue(null);
  mocks.extractCoursesWithAi.mockResolvedValue({ courses: [], warnings: [] });
  mocks.createImportPreview.mockImplementation(async (_userId, payload) => ({ id: "preview-id", ...payload }));
});

function request(body: unknown) {
  return new Request("http://localhost/api/import/ai", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("AI import schedule context", () => {
  it.each([
    ["text", { text: "高等数学 周一 第1-2节" }],
    ["image", { image: "data:image/png;base64,AA==" }],
  ] as const)("uses the page-selected schedule for %s imports instead of the account default", async (mode, source) => {
    const response = await POST(request({ mode, scheduleId: "uibe", ...source }));

    expect(response.status).toBe(201);
    expect(mocks.consumeAiImportAttempt).toHaveBeenCalledWith(expect.stringMatching(/^ai-route-test-/));
    expect(mocks.ensureDefaultSemester).toHaveBeenCalledWith("uibe");
    expect(mocks.extractCoursesWithAi).toHaveBeenCalledWith(mode, Object.values(source)[0], expect.objectContaining({ id: "uibe" }), 20);
    expect(mocks.createImportPreview).toHaveBeenCalledWith(
      expect.stringMatching(/^ai-route-test-/),
      expect.objectContaining({ scheduleId: "uibe", schedule: expect.objectContaining({ id: "uibe" }), weekCount: 20 }),
      "uibe",
    );
  });

  it("validates and preserves custom rows in the preview", async () => {
    const customRows = [
      { start: "08:00", end: "08:50" },
      { start: "09:00", end: "09:50" },
    ];
    const response = await POST(request({ mode: "text", text: "自定义课表", scheduleId: "custom", customRows }));

    expect(response.status).toBe(201);
    expect(mocks.extractCoursesWithAi).toHaveBeenCalledWith(
      "text",
      "自定义课表",
      expect.objectContaining({ id: "custom", rows: [
        { period: 1, start: "08:00", end: "08:50" },
        { period: 2, start: "09:00", end: "09:50" },
      ] }),
      20,
    );
    expect(mocks.createImportPreview).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ scheduleId: "custom", customRows, schedule: expect.objectContaining({ id: "custom" }) }),
      "custom",
    );
  });

  it.each([
    [{ mode: "text", text: "课表" }, "请选择学校作息"],
    [{ mode: "text", text: "课表", scheduleId: "not-a-school" }, "未知的学校作息"],
    [{ mode: "text", text: "课表", scheduleId: "custom", customRows: [null] }, "自定义作息格式无效"],
    [{ mode: "text", text: "课表", scheduleId: "custom", customRows: [{ start: "09:00", end: "08:00" }] }, "结束时间必须晚于开始时间"],
  ])("rejects invalid schedule context %#", async (body, message) => {
    const response = await POST(request(body));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: message });
    expect(mocks.ensureDefaultSemester).not.toHaveBeenCalled();
    expect(mocks.consumeAiImportAttempt).not.toHaveBeenCalled();
    expect(mocks.extractCoursesWithAi).not.toHaveBeenCalled();
    expect(mocks.createImportPreview).not.toHaveBeenCalled();
  });

  it("does not consume quota when the AI service is not configured", async () => {
    mocks.assertAiExtractionConfigured.mockImplementation(() => { throw new Error("AI 识别未配置"); });

    const response = await POST(request({ mode: "text", text: "课表", scheduleId: "pku" }));

    expect(response.status).toBe(500);
    expect(mocks.ensureDefaultSemester).not.toHaveBeenCalled();
    expect(mocks.consumeAiImportAttempt).not.toHaveBeenCalled();
    expect(mocks.extractCoursesWithAi).not.toHaveBeenCalled();
  });

  it.each([
    { mode: "text", text: "   ", scheduleId: "pku" },
    { mode: "image", image: "data:image/gif;base64,AA==", scheduleId: "pku" },
  ])("does not consume quota for invalid source content %#", async (body) => {
    const response = await POST(request(body));

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(mocks.assertAiExtractionConfigured).not.toHaveBeenCalled();
    expect(mocks.ensureDefaultSemester).not.toHaveBeenCalled();
    expect(mocks.consumeAiImportAttempt).not.toHaveBeenCalled();
    expect(mocks.extractCoursesWithAi).not.toHaveBeenCalled();
  });

  it("does not consume quota when local semester preparation fails", async () => {
    mocks.ensureDefaultSemester.mockRejectedValueOnce(new Error("database unavailable"));

    const response = await POST(request({ mode: "text", text: "课表", scheduleId: "pku" }));

    expect(response.status).toBe(500);
    expect(mocks.consumeAiImportAttempt).not.toHaveBeenCalled();
    expect(mocks.extractCoursesWithAi).not.toHaveBeenCalled();
  });

  it("keeps a reserved attempt when the AI provider call fails", async () => {
    mocks.extractCoursesWithAi.mockRejectedValueOnce(new Error("provider unavailable"));

    const response = await POST(request({ mode: "text", text: "课表", scheduleId: "pku" }));

    expect(response.status).toBe(500);
    expect(mocks.consumeAiImportAttempt).toHaveBeenCalledTimes(1);
    expect(mocks.extractCoursesWithAi).toHaveBeenCalledTimes(1);
    expect(mocks.consumeAiImportAttempt.mock.invocationCallOrder[0]).toBeLessThan(mocks.extractCoursesWithAi.mock.invocationCallOrder[0]);
    expect(mocks.createImportPreview).not.toHaveBeenCalled();
  });
});
