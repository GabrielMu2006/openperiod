import { describe, expect, it } from "vitest";
import { sessionCookieIsSecure } from "./cookie-security";

describe("sessionCookieIsSecure", () => {
  it("always keeps production session cookies Secure", () => {
    expect(sessionCookieIsSecure({ NODE_ENV: "production" })).toBe(true);
    expect(sessionCookieIsSecure({ NODE_ENV: "production", ALLOW_INSECURE_COOKIE: "1" })).toBe(true);
  });

  it("keeps local development usable over HTTP", () => {
    expect(sessionCookieIsSecure({ NODE_ENV: "development" })).toBe(false);
    expect(sessionCookieIsSecure({ NODE_ENV: "test" })).toBe(false);
    expect(sessionCookieIsSecure({})).toBe(false);
  });
});
