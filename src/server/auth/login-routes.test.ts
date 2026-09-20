import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "@/src/server/db/schema";
import type { ChallengePurpose } from "@/src/domain/auth";

const mocks = vi.hoisted(() => ({
  getDatabase: vi.fn(), mail: vi.fn(), cookieValues: new Map<string, string>(),
  cookieSet: vi.fn(), cookieDelete: vi.fn(), requestHeaders: new Headers(),
}));
vi.mock("@/src/server/db", () => ({ getDatabase: mocks.getDatabase }));
vi.mock("@/src/server/mail/directmail", async (original) => ({
  ...await original<typeof import("@/src/server/mail/directmail")>(), sendVerificationMail: mocks.mail,
}));
vi.mock("next/headers", () => ({ cookies: async () => ({
  get: (name: string) => { const value = mocks.cookieValues.get(name); return value ? { value } : undefined; },
  set: mocks.cookieSet, delete: mocks.cookieDelete,
}), headers: async () => mocks.requestHeaders }));
vi.mock("./password", async (original) => {
  const actual = await original<typeof import("./password")>();
  return { ...actual, verifyPassword: vi.fn(actual.verifyPassword) };
});

import { POST as identify } from "@/app/api/auth/identify/route";
import { POST as resend } from "@/app/api/auth/resend/route";
import { POST as verify } from "@/app/api/auth/verify/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as passwordRoute } from "@/app/api/auth/password/route";
import { GET as sessionRoute } from "@/app/api/auth/session/route";
import { completePasswordChallenge, requestPasswordChallenge, loginWithPassword } from "./credentials";
import { getCurrentUser, prepareSession, setSessionCookie } from "./session";
import { hashPassword, verifyPassword } from "./password";
import { consumeAuthAttempt } from "./rate-limit";

const client = new PGlite();
const database = drizzle(client, { schema });
const email = "password-auth-test@example.com";
const password = "long test password 2026";
const nextPassword = "replacement test password 2026";
let migrationLegacy: { password_hash: string | null; auth_version: number; session_version: number | null };

beforeAll(async () => {
  // All migrations run in an ephemeral PostgreSQL engine; DATABASE_URL is never used.
  const journal = JSON.parse(await readFile(new URL("../../../drizzle/meta/_journal.json", import.meta.url), "utf8"));
  for (const entry of journal.entries) {
    if (entry.idx === 7) {
      await client.exec("INSERT INTO users (id, email, nickname) VALUES ('00000000-0000-4000-8000-000000000001', 'migration-test@example.com', '迁移测试'); INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ('old-session', '00000000-0000-4000-8000-000000000001', now() + interval '1 day');");
    }
    await client.exec(await readFile(new URL(`../../../drizzle/${entry.tag}.sql`, import.meta.url), "utf8"));
  }
  const migrated = await client.query<typeof migrationLegacy>("SELECT u.password_hash, u.auth_version, s.auth_version AS session_version FROM users u JOIN sessions s ON s.user_id = u.id");
  migrationLegacy = migrated.rows[0];
}, 30_000);

beforeEach(async () => {
  await client.exec("TRUNCATE users, password_challenges, auth_mail_events, auth_rate_limits, semesters CASCADE");
  mocks.getDatabase.mockReturnValue(database);
  mocks.mail.mockReset().mockResolvedValue(undefined);
  mocks.cookieSet.mockReset().mockImplementation((name, value) => { mocks.cookieValues.set(name, value); });
  mocks.cookieDelete.mockReset().mockImplementation((name) => { mocks.cookieValues.delete(name); });
  mocks.cookieValues.clear();
  mocks.requestHeaders = new Headers({ host: "period.example", "x-forwarded-proto": "https" });
  for (const key of ["DIRECTMAIL_ACCESS_KEY_ID", "DIRECTMAIL_ACCESS_KEY_SECRET", "DIRECTMAIL_ACCOUNT"]) vi.stubEnv(key, "isolated-test-only");
  vi.stubEnv("AUTH_SECRET", "isolated-test-secret-at-least-32-characters");
  vi.stubEnv("AUTH_ORIGIN", "");
  vi.stubEnv("TRUST_PROXY_HEADERS", "");
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
afterAll(async () => client.close());

function request(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`http://localhost${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
}
async function existing(withPassword = true) {
  const [user] = await database.insert(schema.users).values({ email, nickname: "原有同学", scheduleId: "pku", defaultPrivacyLevel: 2,
    emailVerifiedAt: new Date(), passwordHash: withPassword ? await hashPassword(password) : null, authVersion: withPassword ? 1 : 0 }).returning();
  return user;
}
async function challenge(purpose: ChallengePurpose = "REGISTER", targetEmail = email) {
  const issued = await requestPasswordChallenge(targetEmail, purpose);
  const code = mocks.mail.mock.calls.at(-1)![1] as string;
  return { email: targetEmail, purpose, challengeId: issued.challengeId, code, password };
}
async function ageMailEvents() {
  await database.update(schema.authMailEvents).set({ createdAt: new Date(Date.now() - 61_000) });
}
async function sessionCount() { return (await database.select().from(schema.sessions)).length; }

describe("password authentication through real SQL and route boundaries", () => {
  it("applies the additive migration and leaves legacy credentials and sessions untrusted", () => {
    expect(migrationLegacy).toEqual({ password_hash: null, auth_version: 0, session_version: null });
  });

  it.each([identify, resend])("rejects the historical email-only contract without creating users or sessions", async (handler) => {
    await existing();
    const response = await handler(request("/api/auth/identify", { email }));
    expect(response.status).toBe(400);
    expect(await sessionCount()).toBe(0);
    expect(mocks.cookieSet).not.toHaveBeenCalled();
    expect(mocks.mail).not.toHaveBeenCalled();
  });

  it("requires challenge id, purpose and new password instead of accepting a legacy email/code", async () => {
    await existing(false);
    const response = await verify(request("/api/auth/verify", { email, code: "123456" }));
    expect(response.status).toBe(400);
    expect(await sessionCount()).toBe(0);
  });

  it("creates an account only after verified registration and returns no secret material", async () => {
    const issued = await identify(request("/api/auth/identify", { email: `  ${email.toUpperCase()}  `, purpose: "REGISTER" }));
    expect(issued.status).toBe(200);
    const body = await issued.json();
    expect(await database.select().from(schema.users)).toHaveLength(0);
    expect(mocks.cookieSet).not.toHaveBeenCalled();
    const response = await verify(request("/api/auth/verify", { ...body, code: mocks.mail.mock.calls[0][1], password }));
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.needsNickname).toBe(true);
    expect(result.user.hasPassword).toBe(true);
    const serialized = JSON.stringify(result);
    for (const secret of ["passwordHash", "codeHash", "token", password, "$argon2"]) expect(serialized).not.toContain(secret);
    const [user] = await database.select().from(schema.users);
    expect(user.passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(await verifyPassword(user.passwordHash, password)).toBe(true);
    expect(mocks.cookieSet).toHaveBeenCalledWith("openperiod_session", expect.any(String), expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/" }));
    expect((await getCurrentUser())?.id).toBe(user.id);
  });

  it("logs in with a password when mail and challenge-secret settings are absent", async () => {
    const user = await existing();
    vi.stubEnv("DIRECTMAIL_ACCOUNT", ""); vi.stubEnv("AUTH_SECRET", "");
    const response = await login(request("/api/auth/login", { email: email.toUpperCase(), password }));
    expect(response.status).toBe(200);
    expect((await response.json()).user.id).toBe(user.id);
    expect(mocks.mail).not.toHaveBeenCalled();
  });

  it("rejects wrong passwords, unknown emails and passwordless users with the same response", async () => {
    await existing();
    const wrong = await login(request("/api/auth/login", { email, password: "wrong" }));
    const unknown = await login(request("/api/auth/login", { email: "unknown-test@example.com", password }));
    await database.update(schema.users).set({ passwordHash: null });
    const legacy = await login(request("/api/auth/login", { email, password }));
    expect([wrong.status, unknown.status, legacy.status]).toEqual([401, 401, 401]);
    expect(await wrong.text()).toBe(await unknown.text());
    expect(await legacy.json()).toHaveProperty("error", "邮箱或密码不正确；老账号请先设置密码");
    expect(await sessionCount()).toBe(0);
  });

  it("preserves an old user's identity, courses, memberships and privacy after first setup", async () => {
    const user = await existing(false);
    const [semester] = await database.insert(schema.semesters).values({ school: "隔离测试学校", academicYear: "2026", semester: "测试学期", startDate: "2026-09-07" }).returning();
    const [group] = await database.insert(schema.groups).values({ name: "auth-test-group", inviteCode: "AUTHTEST", ownerId: user.id, semesterId: semester.id }).returning();
    await database.insert(schema.groupMembers).values({ groupId: group.id, userId: user.id, role: "OWNER" });
    const [course] = await database.insert(schema.courses).values({ userId: user.id, semesterId: semester.id, name: "auth-test-course" }).returning();
    const input = await challenge("SET_PASSWORD");
    const result = await completePasswordChallenge(input);
    expect(result.user).toMatchObject({ id: user.id, nickname: user.nickname, defaultPrivacyLevel: 2, scheduleId: "pku" });
    expect(result.needsNickname).toBe(false);
    expect(await database.select().from(schema.courses)).toEqual([course]);
    expect(await database.select().from(schema.groupMembers)).toHaveLength(1);
    expect((await database.select().from(schema.groups))[0]).toEqual(group);
  });

  it("does not accept an old cookie as proof for first password setup", async () => {
    const user = await existing(false);
    const token = "untrusted-historical-token";
    await database.insert(schema.sessions).values({ tokenHash: createHash("sha256").update(token).digest("hex"), userId: user.id, expiresAt: new Date(Date.now() + 60_000) });
    mocks.cookieValues.set("openperiod_session", token);
    expect(await getCurrentUser()).toBeNull();
    expect((await sessionRoute()).status).toBe(401);
    expect((await passwordRoute(request("/api/auth/password", { currentPassword: "anything", password }))).status).toBe(401);
    expect((await database.select().from(schema.users))[0].passwordHash).toBeNull();
  });

  it("commits wrong-code attempts, stops after five and never establishes a session", async () => {
    const input = await challenge();
    const wrong = input.code === "000000" ? "000001" : "000000";
    const attempts = await Promise.allSettled(Array.from({ length: 5 }, () => completePasswordChallenge({ ...input, code: wrong })));
    expect(attempts.every((attempt) => attempt.status === "rejected")).toBe(true);
    expect((await database.select().from(schema.passwordChallenges))[0].attempts).toBe(5);
    await expect(completePasswordChallenge(input)).rejects.toMatchObject({ status: 400 });
    expect(await sessionCount()).toBe(0);
  });

  it("consumes a challenge once even when two completions compete", async () => {
    const input = await challenge();
    const results = await Promise.allSettled([completePasswordChallenge(input), completePasswordChallenge(input)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await sessionCount()).toBe(1);
    expect(await database.select().from(schema.users)).toHaveLength(1);
  });

  it("binds a challenge to its email, id and purpose, and rejects expired codes", async () => {
    const input = await challenge();
    for (const patch of [{ email: "another-test@example.com" }, { challengeId: randomUUID() }, { purpose: "SET_PASSWORD" as const }]) {
      await expect(completePasswordChallenge({ ...input, ...patch })).rejects.toMatchObject({ status: 400 });
    }
    await database.update(schema.passwordChallenges).set({ expiresAt: new Date(Date.now() - 1) });
    await expect(completePasswordChallenge(input)).rejects.toMatchObject({ status: 400 });
    expect(await sessionCount()).toBe(0);
  });

  it("invalidates previous codes on resend and never revives them after the new code is consumed", async () => {
    const old = await challenge();
    await ageMailEvents();
    const latest = await challenge();
    await expect(completePasswordChallenge(old)).rejects.toMatchObject({ status: 400 });
    await completePasswordChallenge(latest);
    await expect(completePasswordChallenge(old)).rejects.toMatchObject({ status: 400 });
  });

  it("retains rolling daily quota after expired challenges are removed", async () => {
    for (let index = 0; index < 5; index++) { await challenge(); await database.delete(schema.passwordChallenges); await ageMailEvents(); }
    await expect(requestPasswordChallenge(email, "REGISTER")).rejects.toMatchObject({ status: 429 });
    expect(mocks.mail).toHaveBeenCalledTimes(5);
    expect(await database.select().from(schema.authMailEvents)).toHaveLength(5);
  });

  it("serializes concurrent requests so only one code is issued within the cooldown", async () => {
    const outcomes = await Promise.allSettled([requestPasswordChallenge(email, "REGISTER"), requestPasswordChallenge(email, "REGISTER")]);
    expect(outcomes.filter((value) => value.status === "fulfilled")).toHaveLength(1);
    expect(mocks.mail).toHaveBeenCalledTimes(1);
  });

  it("gives ineligible accounts the same request shape and cooldown without creating a user", async () => {
    const response = await requestPasswordChallenge(email, "RESET_PASSWORD");
    expect(response).toMatchObject({ email, purpose: "RESET_PASSWORD", verificationRequired: true, challengeId: expect.any(String) });
    expect(mocks.mail).not.toHaveBeenCalled();
    expect(await database.select().from(schema.users)).toHaveLength(0);
    await expect(requestPasswordChallenge(email, "RESET_PASSWORD")).rejects.toMatchObject({ status: 429 });
  });

  it("cannot overwrite an existing password through first-setup or registration", async () => {
    const user = await existing();
    for (const purpose of ["REGISTER", "SET_PASSWORD"] as const) {
      const body = await requestPasswordChallenge(email, purpose);
      await expect(completePasswordChallenge({ ...body, code: "123456", password: nextPassword })).rejects.toMatchObject({ status: 400 });
      await ageMailEvents();
    }
    expect(mocks.mail).not.toHaveBeenCalled();
    expect((await database.select().from(schema.users))[0].passwordHash).toBe(user.passwordHash);
  });

  it("invalidates every old session on reset and accepts only the new password afterwards", async () => {
    const user = await existing();
    const first = await loginWithPassword(email, password);
    await loginWithPassword(email, password);
    const input = await challenge("RESET_PASSWORD");
    const reset = await completePasswordChallenge({ ...input, password: nextPassword });
    expect(reset.user.id).toBe(user.id);
    expect(await sessionCount()).toBe(1);
    mocks.cookieValues.set("openperiod_session", first.session.token);
    expect(await getCurrentUser()).toBeNull();
    await expect(loginWithPassword(email, password)).rejects.toMatchObject({ status: 401 });
    expect((await loginWithPassword(email, nextPassword)).user.id).toBe(user.id);
    await expect(completePasswordChallenge(input)).rejects.toMatchObject({ status: 400 });
  });

  it("requires the current password to change credentials and rotates the browser session", async () => {
    await existing();
    const signedIn = await login(request("/api/auth/login", { email, password }));
    expect(signedIn.status).toBe(200);
    const oldToken = mocks.cookieValues.get("openperiod_session");
    const recovery = await challenge("RESET_PASSWORD");
    expect((await passwordRoute(request("/api/auth/password", { currentPassword: "wrong", password: nextPassword }))).status).toBe(400);
    expect((await passwordRoute(request("/api/auth/password", { currentPassword: password, password: nextPassword }))).status).toBe(200);
    expect(mocks.cookieValues.get("openperiod_session")).not.toBe(oldToken);
    expect(await getCurrentUser()).not.toBeNull();
    expect(await sessionCount()).toBe(1);
    await expect(completePasswordChallenge(recovery)).rejects.toMatchObject({ status: 400 });
  });

  it("rejects a login whose password verification preceded a concurrent reset", async () => {
    await existing();
    const input = await challenge("RESET_PASSWORD");
    const actual = await vi.importActual<typeof import("./password")>("./password");
    let resume!: () => void;
    let verified!: () => void;
    const barrier = new Promise<void>((resolve) => { resume = resolve; });
    const ready = new Promise<void>((resolve) => { verified = resolve; });
    vi.mocked(verifyPassword).mockImplementationOnce(async (hash, supplied) => {
      const valid = await actual.verifyPassword(hash, supplied);
      verified(); await barrier; return valid;
    });
    const attempted = loginWithPassword(email, password);
    const assertion = expect(attempted).rejects.toMatchObject({ status: 401 });
    await ready;
    await completePasswordChallenge({ ...input, password: nextPassword });
    resume();
    await assertion;
    expect(await sessionCount()).toBe(1);
  });

  it("rolls back password, code consumption and old-session deletion if replacement insertion fails", async () => {
    const user = await existing();
    await loginWithPassword(email, password);
    const input = await challenge("RESET_PASSWORD");
    await client.exec("CREATE FUNCTION auth_test_reject_session() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test failure'; END $$; CREATE TRIGGER auth_test_reject_session BEFORE INSERT ON sessions FOR EACH ROW EXECUTE FUNCTION auth_test_reject_session();");
    try {
      await expect(completePasswordChallenge({ ...input, password: nextPassword })).rejects.toThrow();
      expect((await database.select().from(schema.users))[0].passwordHash).toBe(user.passwordHash);
      expect((await database.select().from(schema.passwordChallenges))[0].consumedAt).toBeNull();
      expect(await sessionCount()).toBe(1);
    } finally { await client.exec("DROP TRIGGER auth_test_reject_session ON sessions; DROP FUNCTION auth_test_reject_session()"); }
    await completePasswordChallenge({ ...input, password: nextPassword });
  });

  it("persists the login limit and atomically resets an elapsed window", async () => {
    await Promise.all(Array.from({ length: 10 }, () => consumeAuthAttempt("login", email)));
    await expect(consumeAuthAttempt("login", email)).rejects.toMatchObject({ status: 429 });
    expect((await database.select().from(schema.authRateLimits))[0].count).toBe(10);
    await database.update(schema.authRateLimits).set({ resetAt: new Date(Date.now() - 1) });
    await consumeAuthAttempt("login", email);
    expect((await database.select().from(schema.authRateLimits))[0].count).toBe(1);
  });

  it("charges failed password requests to the shared persistent limit", async () => {
    for (let index = 0; index < 10; index++) await expect(loginWithPassword(email, password)).rejects.toMatchObject({ status: 401 });
    await expect(loginWithPassword(email, password)).rejects.toMatchObject({ status: 429 });
  });

  it("fails closed after mail delivery fails and retains its quota reservation", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.mail.mockRejectedValueOnce(new Error("simulated provider failure"));
    const response = await identify(request("/api/auth/identify", { email, purpose: "REGISTER" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toHaveProperty("verificationRequired", true);
    expect((await database.select().from(schema.passwordChallenges))[0].consumedAt).not.toBeNull();
    expect(await database.select().from(schema.authMailEvents)).toHaveLength(1);
    expect(await sessionCount()).toBe(0);
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });

  it("does not reveal account eligibility through provider-failure response codes or payloads", async () => {
    await existing();
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.mail.mockRejectedValueOnce(new Error("sensitive provider payload"));
    const known = await identify(request("/api/auth/identify", { email, purpose: "RESET_PASSWORD" }));
    const unknown = await identify(request("/api/auth/identify", { email: "unknown-test@example.com", purpose: "RESET_PASSWORD" }));
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    const { email: knownEmail, challengeId: knownId, ...knownPublic } = await known.json();
    const { email: unknownEmail, challengeId: unknownId, ...unknownPublic } = await unknown.json();
    expect(knownPublic).toEqual(unknownPublic);
    expect(log).toHaveBeenCalledExactlyOnceWith("Verification email delivery failed");
    expect(await sessionCount()).toBe(0);
  });

  it.each([identify, resend, verify, login, passwordRoute])("rejects cross-site authentication requests before any database operation", async (handler) => {
    const response = await handler(request("/api/auth/test", { email, password }, { origin: "https://attacker.example", "sec-fetch-site": "cross-site" }));
    expect(response.status).toBe(403);
    expect(await database.select().from(schema.authRateLimits)).toHaveLength(0);
  });

  it("rejects short or oversized new passwords and oversized HTTP bodies before issuing credentials", async () => {
    const input = await challenge();
    for (const value of ["short", "x".repeat(129)]) {
      expect((await verify(request("/api/auth/verify", { ...input, password: value }))).status).toBe(400);
    }
    expect((await login(request("/api/auth/login", { email, password: "x".repeat(9000) }))).status).toBe(413);
    expect((await login(request("/api/auth/login", { email, password }, { "content-type": "text/plain" }))).status).toBe(415);
    expect((await login(new Request("http://localhost/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: "{" }))).status).toBe(400);
    expect(await sessionCount()).toBe(0);
  });

  it("uses an explicit public origin behind an HTTPS reverse proxy", async () => {
    await existing();
    vi.stubEnv("AUTH_ORIGIN", "https://openperiod.example");
    const accepted = await login(request("/api/auth/login", { email, password }, { origin: "https://openperiod.example", "sec-fetch-site": "same-origin" }));
    expect(accepted.status).toBe(200);
    const rejected = await login(request("/api/auth/login", { email, password }, { origin: "https://other.example" }));
    expect(rejected.status).toBe(403);
  });

  it("rejects production HTTP auth and keeps the real cookie Secure despite a legacy downgrade variable", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_ORIGIN", "https://period.example");
    vi.stubEnv("TRUST_PROXY_HEADERS", "1");
    vi.stubEnv("ALLOW_INSECURE_COOKIE", "1");
    const response = await login(request("/api/auth/login", { email, password }, {
      host: "period.example", "x-forwarded-proto": "http",
    }));
    expect(response.status).toBe(426);
    expect(await database.select().from(schema.authRateLimits)).toHaveLength(0);

    await setSessionCookie(prepareSession(randomUUID(), 1));
    expect(mocks.cookieSet).toHaveBeenLastCalledWith("openperiod_session", expect.any(String), expect.objectContaining({
      secure: true, httpOnly: true, sameSite: "lax", priority: "high", path: "/",
    }));
  });

  it("checks the actual Host when Next uses an internal hostname, without trusting forwarding headers", async () => {
    await existing();
    const accepted = await login(request("/api/auth/login", { email, password }, { host: "127.0.0.1:3109", origin: "http://127.0.0.1:3109", "sec-fetch-site": "same-origin" }));
    expect(accepted.status).toBe(200);
    const rejected = await login(request("/api/auth/login", { email, password }, { host: "127.0.0.1:3109", origin: "https://attacker.example", "x-forwarded-host": "attacker.example", "x-forwarded-proto": "https" }));
    expect(rejected.status).toBe(403);
  });

  it("keeps password whitespace and long passphrases intact", async () => {
    const input = await challenge();
    const phrase = "  correct horse test battery staple  ";
    await completePasswordChallenge({ ...input, password: phrase });
    await expect(loginWithPassword(email, phrase.trim())).rejects.toMatchObject({ status: 401 });
    expect((await loginWithPassword(email, phrase)).user.email).toBe(email);
  });
});
