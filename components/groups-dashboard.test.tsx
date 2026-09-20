// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => {
  const replace = vi.fn();
  return { replace, router: { replace } };
});
vi.mock("next/navigation", () => ({ useRouter: () => mocks.router }));

import { GroupsDashboard } from "./groups-dashboard";

const activeGroup = {
  id: "30000000-0000-4000-8000-000000000001",
  name: "项目小组",
  inviteCode: "GROUP001",
  role: "OWNER" as const,
  archivedAt: null as string | null,
  privacyLevel: 1 as const,
  members: [
    { id: "30000000-0000-4000-8000-000000000002", nickname: "小陈", role: "OWNER" as const },
    { id: "30000000-0000-4000-8000-000000000003", nickname: "小李", role: "MEMBER" as const },
  ],
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  mocks.replace.mockReset();
  vi.stubGlobal("confirm", vi.fn(() => true));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("group lifecycle dashboard", () => {
  it("lets an owner rename, archive and restore while showing the retention warning", async () => {
    const user = userEvent.setup();
    const stored = structuredClone(activeGroup);
    const requests: { url: string; method: string; body?: unknown }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url === "/api/auth/session") return json({ user: { nickname: "小陈", email: "group-owner-test@example.com" } });
      if (url === "/api/groups?includeArchived=1") return json({ groups: [stored], defaultPrivacyLevel: 1 });
      if (url === `/api/groups/${stored.id}` && init?.method === "PATCH") {
        const body = JSON.parse(String(init.body)) as { action: "rename" | "archive"; name?: string; archived?: boolean };
        requests.push({ url, method: init.method, body });
        if (body.action === "rename") stored.name = body.name!;
        else stored.archivedAt = body.archived ? "2026-09-20T08:00:00.000Z" : null;
        return json({ group: stored });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }));

    render(<GroupsDashboard />);
    expect(await screen.findByRole("heading", { name: "项目小组" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "管理群组" }));
    const input = screen.getByRole("textbox", { name: "群组名称" });
    await user.clear(input);
    await user.type(input, "秋季项目组");
    await user.click(screen.getByRole("button", { name: "保存" }));
    expect(await screen.findByRole("heading", { name: "秋季项目组" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "管理群组" }));
    await user.click(screen.getByRole("button", { name: "归档" }));
    expect(await screen.findByText(/群组数据和成员关系均已保留/)).toBeTruthy();
    expect(screen.queryByText("GROUP001")).toBeNull();
    expect(screen.queryByRole("link", { name: /查看共同空闲/ })).toBeNull();

    await user.click(screen.getByRole("button", { name: "恢复群组" }));
    expect(await screen.findByText("GROUP001")).toBeTruthy();
    expect(requests.map((request) => request.body)).toEqual([
      { action: "rename", name: "秋季项目组" },
      { action: "archive", archived: true },
      { action: "archive", archived: false },
    ]);
  });

  it("shows the member impact warning and calls the leave endpoint for an archived group", async () => {
    const user = userEvent.setup();
    let exists = true;
    const memberGroup = {
      ...structuredClone(activeGroup),
      id: "30000000-0000-4000-8000-000000000010",
      name: "已结束讨论组",
      role: "MEMBER" as const,
      archivedAt: "2026-09-20T08:00:00.000Z",
    };
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url === "/api/auth/session") return json({ user: { nickname: "小李", email: "group-member-test@example.com" } });
      if (url === "/api/groups?includeArchived=1") return json({ groups: exists ? [memberGroup] : [] });
      if (url === `/api/groups/${memberGroup.id}` && init?.method === "DELETE") {
        exists = false;
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<GroupsDashboard />);
    expect(await screen.findByRole("heading", { name: "已结束讨论组" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "退出群组" }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "已结束讨论组" })).toBeNull());
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("不会删除账号或个人课表"));
    expect(fetchMock).toHaveBeenCalledWith(`/api/groups/${memberGroup.id}`, { method: "DELETE" });
  });
});
