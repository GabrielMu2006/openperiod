// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => {
  const replace = vi.fn();
  return { replace, router: { replace } };
});
vi.mock("next/navigation", () => ({ useRouter: () => mocks.router }));

import { MySchedule } from "./my-schedule";

const schedule = {
  week: 3,
  confirmedEmpty: false,
  semester: {
    academicYear: "2026-2027",
    semester: "秋季学期",
    currentWeek: 3,
    weekCount: 20,
    startDate: "2026-09-07",
    timezone: "Asia/Shanghai",
    scheduleId: "pku",
    schedule: {
      id: "pku",
      school: "测试大学",
      kind: "period" as const,
      rows: [
        { start: "08:00", end: "08:50", label: "第 1 节" },
        { start: "09:00", end: "09:50", label: "第 2 节" },
        { start: "10:00", end: "10:50", label: "第 3 节" },
        { start: "11:00", end: "11:50", label: "第 4 节" },
      ],
    },
  },
  courses: [{
    id: "course-1",
    name: "高等数学",
    instructor: "测试老师",
    location: "一教 101",
    meetings: [{
      id: "meeting-1",
      weekday: "monday" as const,
      startPeriod: 1,
      endPeriod: 2,
      weeks: [3],
      skippedThisWeek: false,
      skippedWeeks: [],
    }],
  }],
  busyBlocks: [{
    id: "busy-1",
    kind: "RECURRING" as const,
    title: "社团活动",
    weekday: "tuesday" as const,
    startPeriod: 3,
    endPeriod: 4,
    weeks: [3],
  }],
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  mocks.replace.mockReset();
  window.history.replaceState(null, "", "/schedule");
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
  localStorage.setItem("op-schedule-info-seen", "pku");
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url === "/api/auth/session") return json({ user: { nickname: "测试同学", email: "schedule-test@example.com" } });
    if (url.startsWith("/api/schedule")) return json({ schedule });
    throw new Error(`Unexpected fetch: ${url}`);
  }));
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("my schedule responsive views", () => {
  it("announces a stable loading state before the schedule arrives", async () => {
    let releaseSchedule: (() => void) | undefined;
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url === "/api/auth/session") return json({ user: { nickname: "测试同学", email: "schedule-test@example.com" } });
      if (url.startsWith("/api/schedule")) {
        return await new Promise<Response>((resolve) => {
          releaseSchedule = () => resolve(json({ schedule }));
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }));

    render(<MySchedule />);
    const loadingLabel = screen.getByText("正在读取个人课表…");
    expect(loadingLabel.closest('[role="status"]')?.getAttribute("aria-busy")).toBe("true");

    releaseSchedule?.();
    expect(await screen.findByRole("group", { name: "选择星期" })).toBeTruthy();
    expect(screen.queryByText("正在读取个人课表…")).toBeNull();
  });

  it("defaults to a mobile day timeline and keeps day and week interactions available", async () => {
    const user = userEvent.setup();
    render(<MySchedule />);

    expect(await screen.findByRole("group", { name: "选择星期" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "按天" }).getAttribute("aria-pressed")).toBe("true");

    await user.click(screen.getByRole("button", { name: /周一9\/21/ }));
    await user.click(screen.getByRole("button", { name: "高等数学，08:00–09:50，查看详情" }));
    expect(await screen.findByRole("dialog", { name: "课程详情" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "关闭" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "课程详情" })).toBeNull());

    await user.click(screen.getByRole("button", { name: "周一 10:00–10:50，标记忙碌" }));
    expect(await screen.findByRole("dialog", { name: "标记忙碌" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "关闭" }));

    await user.click(screen.getByRole("button", { name: "周总览" }));
    expect(screen.getByRole("button", { name: "周一 第3节，标记忙碌" })).toBeTruthy();
    expect(screen.getByText("9/21")).toBeTruthy();
  });
});
