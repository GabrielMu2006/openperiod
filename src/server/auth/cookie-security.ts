// SEC-01: production session cookies cannot be downgraded by configuration.
// Development remains usable over localhost HTTP.
export function sessionCookieIsSecure(env: { NODE_ENV?: string; [key: string]: string | undefined }) {
  return env.NODE_ENV === "production";
}
