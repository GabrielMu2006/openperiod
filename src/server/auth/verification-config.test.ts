import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getDatabase: vi.fn(), sendVerificationMail: vi.fn() }));
vi.mock("@/src/server/db", () => ({ getDatabase: mocks.getDatabase }));
vi.mock("@/src/server/mail/directmail", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/src/server/mail/directmail")>(),
  sendVerificationMail: mocks.sendVerificationMail,
}));

import { assertEmailVerificationConfigured } from "./verification";
import { requestPasswordChallenge } from "./credentials";

const requiredSettings = ["DIRECTMAIL_ACCESS_KEY_ID", "DIRECTMAIL_ACCESS_KEY_SECRET", "DIRECTMAIL_ACCOUNT"] as const;

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("AUTH_SECRET", "test-only-secret-with-at-least-32-characters");
  for (const setting of requiredSettings) vi.stubEnv(setting, "test-only-placeholder");
  mocks.getDatabase.mockImplementation(() => { throw new Error("Unexpected database access in configuration test"); });
});

afterEach(() => vi.unstubAllEnvs());

describe("mail configuration fails closed for all code-issuing callers", () => {
  it.each(requiredSettings)("rejects missing %s before any database or mail side effects", async (setting) => {
    vi.stubEnv(setting, "");
    expect(() => assertEmailVerificationConfigured()).toThrow("邮箱验证服务暂不可用");
    await expect(requestPasswordChallenge("auth-test@example.com", "REGISTER")).rejects.toMatchObject({ status: 503 });
    expect(mocks.getDatabase).not.toHaveBeenCalled();
    expect(mocks.sendVerificationMail).not.toHaveBeenCalled();
  });

  it("does not require the optional sender alias", () => {
    vi.stubEnv("DIRECTMAIL_FROM_ALIAS", "");
    expect(() => assertEmailVerificationConfigured()).not.toThrow();
    expect(mocks.getDatabase).not.toHaveBeenCalled();
  });

  it("rejects a missing challenge secret before writing or sending", async () => {
    vi.stubEnv("AUTH_SECRET", "");
    await expect(requestPasswordChallenge("auth-test@example.com", "REGISTER")).rejects.toMatchObject({ status: 503 });
    expect(mocks.getDatabase).not.toHaveBeenCalled();
    expect(mocks.sendVerificationMail).not.toHaveBeenCalled();
  });
});
