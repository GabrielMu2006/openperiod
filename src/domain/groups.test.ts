import { describe, expect, it } from "vitest";
import { generateInviteCode, normalizeInviteCode } from "./groups";

describe("group invite codes", () => {
  it("uses a six-character alphabet without ambiguous characters", () => {
    const code = generateInviteCode(() => 0, 6);
    expect(code).toBe("222222");
    expect(code).not.toMatch(/[01IO]/);
  });

  it("normalizes pasted invite codes", () => {
    expect(normalizeInviteCode("  a7fq9k ")).toBe("A7FQ9K");
  });
});
