import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "@/src/server/db/schema";

const mocks = vi.hoisted(() => ({ getDatabase: vi.fn() }));
vi.mock("@/src/server/db", () => ({ getDatabase: mocks.getDatabase }));

import { AI_DAILY_LIMIT, AI_QUOTA_TIME_ZONE, consumeAiImportAttempt, nextAiQuotaResetAt } from "./ai-quota";

const client = new PGlite();
const database = drizzle(client, { schema });

beforeAll(async () => {
  const journal = JSON.parse(await readFile(new URL("../../../drizzle/meta/_journal.json", import.meta.url), "utf8"));
  for (const entry of journal.entries) {
    await client.exec(await readFile(new URL(`../../../drizzle/${entry.tag}.sql`, import.meta.url), "utf8"));
  }
}, 30_000);

beforeEach(async () => {
  await client.exec("TRUNCATE auth_rate_limits");
  mocks.getDatabase.mockReturnValue(database);
});

afterAll(async () => client.close());

describe("persistent AI import quota", () => {
  it("resets on the next Asia/Shanghai calendar-day boundary", () => {
    expect(AI_QUOTA_TIME_ZONE).toBe("Asia/Shanghai");
    expect(nextAiQuotaResetAt(new Date("2026-09-20T15:59:59.999Z")).toISOString()).toBe("2026-09-20T16:00:00.000Z");
    expect(nextAiQuotaResetAt(new Date("2026-09-20T16:00:00.000Z")).toISOString()).toBe("2026-09-21T16:00:00.000Z");
  });

  it("atomically permits only ten competing attempts for one account", async () => {
    const now = new Date("2026-09-20T08:00:00.000Z");
    const outcomes = await Promise.allSettled(
      Array.from({ length: AI_DAILY_LIMIT + 2 }, () => consumeAiImportAttempt("same-user", now)),
    );

    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(AI_DAILY_LIMIT);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(2);
    for (const outcome of outcomes.filter((value) => value.status === "rejected")) {
      expect(outcome.reason).toMatchObject({ status: 429 });
    }
    expect(await database.select().from(schema.authRateLimits)).toEqual([
      expect.objectContaining({ key: "ai-import:same-user", count: AI_DAILY_LIMIT, resetAt: new Date("2026-09-20T16:00:00.000Z") }),
    ]);
  });

  it("keeps accounts isolated and starts a fresh count after midnight", async () => {
    const beforeMidnight = new Date("2026-09-20T15:59:59.000Z");
    for (let index = 0; index < AI_DAILY_LIMIT; index++) await consumeAiImportAttempt("user-a", beforeMidnight);
    await consumeAiImportAttempt("user-b", beforeMidnight);
    await expect(consumeAiImportAttempt("user-a", beforeMidnight)).rejects.toMatchObject({ status: 429 });

    const afterMidnight = new Date("2026-09-20T16:00:00.000Z");
    await expect(consumeAiImportAttempt("user-a", afterMidnight)).resolves.toMatchObject({
      limit: AI_DAILY_LIMIT,
      resetAt: new Date("2026-09-21T16:00:00.000Z"),
    });

    const rows = await database.select().from(schema.authRateLimits);
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "ai-import:user-a", count: 1 }),
      expect.objectContaining({ key: "ai-import:user-b", count: 1 }),
    ]));
  });
});
