import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { env, DEMO_MODE } from "./env";
import * as repo from "./repo";

const secret = new TextEncoder().encode(env.authSecret);
const CLIENT_COOKIE = "cfba_session";
const STAFF_COOKIE = "cfba_staff";

const DEV_SECRET = "dev-only-insecure-secret-change-me";

// Fail CLOSED, not open. env.authSecret silently defaults to a public string
// when AUTH_SECRET is unset; signing or verifying a session with a value
// everyone knows would let anyone forge a staff cookie. In a live environment
// (real Supabase configured) refuse rather than run insecure. Throws at
// request time — a loud 500 — never at build.
function assertSecret() {
  if (!DEMO_MODE && env.authSecret === DEV_SECRET) {
    throw new Error(
      "AUTH_SECRET is not set in a live environment — refusing to sign or verify sessions with the public default."
    );
  }
}

export interface ClientSession {
  companyId: string;
  companyName: string;
  username: string;
  /** Optional person name for this login, used to attribute messages. */
  displayName?: string;
  /** True when a staff member is viewing this company's portal. */
  impersonated?: boolean;
}

async function sign(payload: Record<string, unknown>, hours: number) {
  assertSecret();
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${hours}h`)
    .sign(secret);
}

// 30 days with "remember me" (was 14): a builder who has to re-log weekly on
// site stops using the portal. The JWT expiry and cookie maxAge move together.
export async function setClientSession(s: ClientSession, hours = 24 * 30) {
  const token = await sign({ ...s, kind: "client" }, hours);
  (await cookies()).set(CLIENT_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: hours * 3600,
  });
}

/**
 * Whether a login has been disabled (or deleted) since its session was signed.
 *
 * A session is a signed cookie that can outlive its login by thirty days, and
 * the team screen exists precisely to lock out someone who has left — a
 * disable that only bites at the NEXT sign-in would miss the one person it's
 * for. Cached per instance for a minute so the check doesn't add a database
 * read to literally every request; the cache is dropped for a username the
 * moment this instance disables it.
 *
 * Fails OPEN on a read error: a database hiccup must sign nobody out. It only
 * ends a session on a definite "disabled" or "gone".
 */
const liveness = new Map<string, { at: number; dead: boolean }>();
const LIVENESS_TTL_MS = 60_000;

async function loginDead(username: string): Promise<boolean> {
  const hit = liveness.get(username);
  if (hit && Date.now() - hit.at < LIVENESS_TTL_MS) return hit.dead;
  let dead = false;
  try {
    const login = await repo.getLogin(username);
    dead = !login || login.disabled;
  } catch {
    dead = false;
  }
  liveness.set(username, { at: Date.now(), dead });
  return dead;
}

/** Make a just-disabled login bite immediately on this instance, rather than
 *  up to a minute later. Other serverless instances converge within the TTL. */
export function forgetLoginLiveness(username: string) {
  liveness.delete(username);
}

export async function getClientSession(): Promise<ClientSession | null> {
  assertSecret();
  const c = (await cookies()).get(CLIENT_COOKIE)?.value;
  if (!c) return null;
  try {
    const { payload } = await jwtVerify(c, secret);
    if (payload.kind !== "client") return null;
    const s: ClientSession = {
      companyId: String(payload.companyId),
      companyName: String(payload.companyName),
      username: String(payload.username || ""),
      displayName: payload.displayName ? String(payload.displayName) : undefined,
      impersonated: !!payload.impersonated,
    };
    // An impersonated session is a staff member, not the login itself.
    if (s.username && !s.impersonated && (await loginDead(s.username))) return null;
    return s;
  } catch {
    return null;
  }
}

export async function clearClientSession() {
  (await cookies()).delete(CLIENT_COOKIE);
}

export async function setStaffSession() {
  const token = await sign({ kind: "staff" }, 12);
  (await cookies()).set(STAFF_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 12 * 3600,
  });
}

export async function isStaff(): Promise<boolean> {
  assertSecret();
  const c = (await cookies()).get(STAFF_COOKIE)?.value;
  if (!c) return false;
  try {
    const { payload } = await jwtVerify(c, secret);
    return payload.kind === "staff";
  } catch {
    return false;
  }
}

export async function clearStaffSession() {
  (await cookies()).delete(STAFF_COOKIE);
}
