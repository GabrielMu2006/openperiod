// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => {
  const replace = vi.fn();
  return { replace, router: { replace } };
});
vi.mock("next/navigation", () => ({ useRouter: () => mocks.router }));

import { CommonAvailability } from "./common-availability";

const weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
const gridRows = [
  { period: 1, label: "第 1 节", timeText: "08:00–08:45", startMin: 480, endMin: 525 },
  { period: 2, label: "第 2 节", timeText: "08:55–09:40", startMin: 535, endMin: 580 },
];

const group = {
  id: "group-1",
  name: "QA 测试群",
  inviteCode: "QATEST",
  role: "OWNER",
  privacyLevel: 2,
  semester: {
    academicYear: "2026-2027",
    semester: "秋季学期",
    currentWeek: 2,
    weekCount: 20,
    startDate: "2026-09-07",
    timezone: "Asia/Shanghai",
    scheduleId: "custom",
    schedule: { rows: gridRows.map((row) => ({ start: row.timeText.slice(0, 5), end: row.timeText.slice(6) })) },
  },
  members: [{ id: "user-1", nickname: "测试同学", courseCount: 1, scheduleId: "custom", scheduleState: "recorded" }],
};

const slots = Object.fromEntries(weekdays.map((weekday) => [weekday, {
  "1": { commonFree: true, freeCount: 1, selectedUsers: 1, unknownCount: 0 },
  "2": { commonFree: true, freeCount: 1, selectedUsers: 1, unknownCount: 0 },
}]));

const freeIntervals = Object.fromEntries(weekdays.map((weekday) => [weekday, [{ startMin: 480, endMin: 525 }]]));

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

function mockApi(failFirstGroupsRequest = false) {
  let groupRequests = 0;
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url === "/api/auth/session") return json({ user: { nickname: "测试同学", email: "qa-test@example.com" } });
    if (url === "/api/groups") {
      groupRequests += 1;
      if (failFirstGroupsRequest && groupRequests === 1) return json({ error: "unavailable" }, 503);
      return json({ groups: [group] });
    }
    if (url.includes("/availability/details?")) return json({
      commonFree: true,
      freeCount: 1,
      selectedUsers: 1,
      unknownCount: 0,
      details: [{ userId: "user-1", nickname: "测试同学", free: true }],
      gridRow: gridRows[1],
    });
    if (url.includes("/availability?")) return json({
      week: 2,
      selectedUsers: 1,
      unknownCount: 0,
      gridRows,
      slots,
      freeIntervals,
    });
    throw new Error(`Unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, groupRequests: () => groupRequests };
}

beforeEach(() => {
  mocks.replace.mockReset();
  window.history.replaceState(null, "", "/");
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
  // 固定「今天 = 2026-09-16（周三，第 2 周）」，避免测试随真实日历翻页而失效；
  // 仅 mock Date，保留真实定时器以兼容 userEvent / waitFor。
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-09-16T04:00:00Z") });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("common availability interaction regression", () => {
  it("supports the narrow-screen main flow, grid arrow keys and an Escape-close detail dialog", async () => {
    const user = userEvent.setup();
    mockApi();
    render(<CommonAvailability />);

    expect(await screen.findByRole("group", { name: "选择星期" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "按天" }).getAttribute("aria-pressed")).toBe("true");
    await user.click(screen.getByRole("button", { name: "周总览" }));

    const mondayFirst = await screen.findByRole("button", { name: /周一.*08:00–08:45，所有人共同空闲/ });
    mondayFirst.focus();
    expect(document.activeElement).toBe(mondayFirst);
    fireEvent.keyDown(mondayFirst, { key: "ArrowRight" });
    const tuesdayFirst = screen.getByRole("button", { name: /周二.*08:00–08:45，所有人共同空闲/ });
    expect(document.activeElement).toBe(tuesdayFirst);

    fireEvent.keyDown(tuesdayFirst, { key: "ArrowDown" });
    const tuesdaySecond = screen.getByRole("button", { name: /周二.*08:55–09:40，所有人共同空闲/ });
    expect(document.activeElement).toBe(tuesdaySecond);

    await user.click(tuesdaySecond);
    const dialog = await screen.findByRole("dialog", { name: /周二.*08:55–09:40/ });
    expect(document.activeElement).toBe(dialog);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(tuesdaySecond);

    await user.click(screen.getByRole("button", { name: "按天" }));
    expect(screen.getByRole("group", { name: "选择星期" })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "移动端主导航" }).querySelectorAll("a")).toHaveLength(4);
    await user.click(screen.getByRole("button", { name: "周一9/14" }));
    expect(screen.getByRole("button", { name: /周一.*08:00–08:45，所有人共同空闲/ })).toBeTruthy();
  });

  it("recovers from a failed group request through the visible retry action", async () => {
    const user = userEvent.setup();
    const api = mockApi(true);
    render(<CommonAvailability />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("暂时无法读取群组数据");
    await user.click(screen.getByRole("button", { name: "重试" }));

    expect(await screen.findByRole("region", { name: "共同空闲课表" })).toBeTruthy();
    expect(api.groupRequests()).toBe(2);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps the existing result layout while a new teaching week is loading", async () => {
    const user = userEvent.setup();
    let availabilityRequests = 0;
    let releaseUpdate: (() => void) | undefined;
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url === "/api/auth/session") return json({ user: { nickname: "测试同学", email: "qa-test@example.com" } });
      if (url === "/api/groups") return json({ groups: [group] });
      if (url.includes("/availability?")) {
        availabilityRequests += 1;
        if (availabilityRequests === 1) return json({ week: 2, selectedUsers: 1, unknownCount: 0, gridRows, slots, freeIntervals });
        return await new Promise<Response>((resolve) => {
          releaseUpdate = () => resolve(json({ week: 3, selectedUsers: 1, unknownCount: 0, gridRows, slots, freeIntervals }));
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<CommonAvailability />);

    await user.click(await screen.findByRole("button", { name: "周总览" }));
    expect(await screen.findByRole("button", { name: /周一.*08:00–08:45，所有人共同空闲/ })).toBeTruthy();
    const resultRegion = document.querySelector<HTMLElement>(".availability-results");
    expect(resultRegion?.querySelectorAll(".slot-count")).toHaveLength(14);

    await user.click(screen.getByRole("button", { name: "下一周" }));
    const updating = await screen.findByText("正在更新共同空闲…");
    expect(updating.closest('[role="status"]')).toBeTruthy();
    expect(resultRegion?.getAttribute("aria-busy")).toBe("true");
    expect(resultRegion?.querySelectorAll(".slot-count")).toHaveLength(14);

    releaseUpdate?.();
    await waitFor(() => expect(screen.queryByText("正在更新共同空闲…")).toBeNull());
    expect(resultRegion?.getAttribute("aria-busy")).toBe("false");
  });
});
