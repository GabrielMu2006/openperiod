import { describe, expect, it } from "vitest";
import { normalizeIdentity } from "./identity";

describe("normalizeIdentity", () => {
  it("normalizes the V1 email identity key", () => {
    expect(normalizeIdentity({ nickname: "  Gabriel  ", email: "  USER@PKU.EDU.CN " })).toEqual({
      nickname: "Gabriel",
      email: "user@pku.edu.cn",
    });
  });
});
