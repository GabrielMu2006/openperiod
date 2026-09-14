import { describe, expect, it } from "vitest";
import { isPlaceholderNickname, normalizeIdentity, placeholderNicknameFor } from "./identity";

describe("normalizeIdentity", () => {
  it("normalizes the email identity key", () => {
    expect(normalizeIdentity({ email: "  USER@PKU.EDU.CN " })).toEqual({
      email: "user@pku.edu.cn",
    });
  });
});

describe("placeholderNicknameFor", () => {
  it("uses the email local part as the placeholder nickname", () => {
    expect(placeholderNicknameFor("lmz@stu.pku.edu.cn")).toBe("lmz");
  });

  it("falls back when the local part is empty", () => {
    expect(placeholderNicknameFor("@stu.pku.edu.cn")).toBe("同学");
  });

  it("detects placeholder nicknames", () => {
    const email = "gabriel@example.com";
    expect(isPlaceholderNickname("gabriel", email)).toBe(true);
    expect(isPlaceholderNickname("Gabriel", email)).toBe(false);
  });
});
