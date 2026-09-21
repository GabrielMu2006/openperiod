import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  ensureDefaultSemester: vi.fn(),
  saveUserCustomSchedule: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
  where: vi.fn(),
}));

vi.mock("@/src/server/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/src/server/semesters/data", () => ({
  ensureDefaultSemester: mocks.ensureDefaultSemester,
  saveUserCustomSchedule: mocks.saveUserCustomSchedule,
}));
vi.mock("@/src/server/db", () => ({
  getDatabase: () => ({
    update: mocks.update,
  }),
}));

import { POST } from "@/app/api/schedule/custom-rows/route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: "custom-rows-test", scheduleId: "pku" });
  mocks.ensureDefaultSemester.mockResolvedValue({ weekCount: 16 });
  mocks.saveUserCustomSchedule.mockResolvedValue(undefined);
  mocks.where.mockResolvedValue(undefined);
  mocks.set.mockReturnValue({ where: mocks.where });
  mocks.update.mockReturnValue({ set: mocks.set });
});

function request(body: unknown) {
  return new Request("http://localhost/api/schedule/custom-rows", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("custom schedule rows endpoint", () => {
  it("saves rows, switches the user to the custom grid", async () => {
    const rows = [
      { start: "08:00", end: "08:50" },
      { start: "09:00", end: "09:50" },
    ];
    const response = await POST(request({ rows }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.ensureDefaultSemester).toHaveBeenCalledWith("custom");
    expect(mocks.saveUserCustomSchedule).toHaveBeenCalledWith("custom-rows-test", rows);
    expect(mocks.update).toHaveBeenCalledWith(expect.anything());
    expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({ scheduleId: "custom" }));
  });

  it.each([
    [{ rows: [] }],
    [{ rows: [{ start: "09:00", end: "08:00" }] }],
    [{ rows: [{ start: "08:00", end: "08:50" }, { start: "08:30", end: "09:30" }] }],
    [{}],
  ] as const)("rejects invalid payloads with 400: %j", async (body) => {
    const response = await POST(request(body));
    expect(response.status).toBe(400);
    expect(mocks.saveUserCustomSchedule).not.toHaveBeenCalled();
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("requires login", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const response = await POST(request({ rows: [{ start: "08:00", end: "08:50" }] }));
    expect(response.status).toBe(401);
    expect(mocks.saveUserCustomSchedule).not.toHaveBeenCalled();
  });
});
