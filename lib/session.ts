import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { env } from "./env";

const secret = new TextEncoder().encode(env.authSecret);
const CLIENT_COOKIE = "cfba_session";
const STAFF_COOKIE = "cfba_staff";

export interface ClientSession {
  companyId: string;
  companyName: string;
  username: string;
  /** True when a staff member is viewing this company's portal. */
  impersonated?: boolean;
}

async function sign(payload: Record<string, unknown>, hours: number) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${hours}h`)
    .sign(secret);
}

export async function setClientSession(s: ClientSession, hours = 24 * 14) {
  const token = await sign({ ...s, kind: "client" }, hours);
  (await cookies()).set(CLIENT_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: hours * 3600,
  });
}

export async function getClientSession(): Promise<ClientSession | null> {
  const c = (await cookies()).get(CLIENT_COOKIE)?.value;
  if (!c) return null;
  try {
    const { payload } = await jwtVerify(c, secret);
    if (payload.kind !== "client") return null;
    return {
      companyId: String(payload.companyId),
      companyName: String(payload.companyName),
      username: String(payload.username || ""),
      impersonated: !!payload.impersonated,
    };
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
