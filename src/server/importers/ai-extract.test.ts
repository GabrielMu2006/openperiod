import { afterEach, describe, expect, it, vi } from "vitest";
import { PKU_SCHEDULE } from "@/src/config/school-schedules";
import { extractCoursesWithAi } from "./ai-extract";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("AI import semester weeks", () => {
  it("passes the actual week count to the model prompt and preserves weeks 17-20", async () => {
    vi.stubEnv("ZHIPU_API_KEY", "test-only-key");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ courses: [{
        name: "长学期课程", day: 1, periods: "1-2", time: "", weeks: "17-20",
      }] }) } }],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await extractCoursesWithAi("text", "长学期课程", PKU_SCHEDULE, 20);

    expect(result.courses[0].meetings[0].weeks).toEqual([17, 18, 19, 20]);
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    const requestBody = JSON.parse(String(request.body)) as { messages: { content: string }[] };
    expect(requestBody.messages[0].content).toContain("目标学期共 20 周");
    expect(requestBody.messages[0].content).toContain('没写就填 "1-20"');
  });
});
