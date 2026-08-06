import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { env } from "./env";
import * as repo from "./repo";
import { hashPassword, verifyPassword, passwordProblem } from "./auth";

/**
 * Site Plan Studio — a standalone site-plan tool.
 *
 * Deliberately independent of the CF Building Approvals client portal: a
 * building surveyor must not be involved in the design of the projects they
 * certify, so this design tool shares no identity, no login and no visible
 * connection with the certifier's portal. Everyone here has a studio account
 * of their own, and everything the studio stores hangs off that account's
 * OWNER string.
 *
 * Storage happens to reuse the settings k/v store (invisible backend, no
 * migration): `studio_user:<email>` for accounts, `studio_designs:<owner>`
 * for the design index, `studio_design:<owner>:<id>` for each drawing.
 */

// Neutral name on purpose — nothing in the browser ties this to the certifier.
const COOKIE = "siteplan_session";
const secret = () => new TextEncoder().encode(env.authSecret);

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export interface StudioUser {
  email: string;
  name: string;
  passwordHash: string;
  createdAt: string;
}

export const emailKey = (e: string) => String(e || "").trim().toLowerCase();

const looksLikeEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

export async function getStudioUser(email: string): Promise<StudioUser | null> {
  const u = await repo.getSetting<StudioUser>(`studio_user:${emailKey(email)}`);
  return u?.passwordHash ? u : null;
}

export async function createStudioUser(
  email: string, name: string, password: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const key = emailKey(email);
  if (!looksLikeEmail(key)) return { ok: false, error: "That doesn't look like an email address." };
  const bad = passwordProblem(password);
  if (bad) return { ok: false, error: bad };
  if (await getStudioUser(key)) {
    return { ok: false, error: "There's already an account for that email — sign in instead." };
  }
  const user: StudioUser = {
    email: key,
    name: String(name || "").trim().slice(0, 80),
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString(),
  };
  await repo.setSetting(`studio_user:${key}`, user);
  return { ok: true };
}

export async function verifyStudioLogin(
  email: string, password: string
): Promise<StudioUser | null> {
  const u = await getStudioUser(email);
  if (!u) return null;
  return verifyPassword(password, u.passwordHash) ? u : null;
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export async function setStudioSession(email: string, name: string) {
  const token = await new SignJWT({ kind: "studio", email: emailKey(email), name })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearStudioSession() {
  (await cookies()).delete(COOKIE);
}

export interface StudioIdentity {
  /** Everything stored hangs off this: `u:<email>`. */
  owner: string;
  /** What the header greets them as. */
  name: string;
}

/**
 * Who's at the studio door — a studio account, and nothing else. This does
 * NOT consult the CF Building Approvals portal session on purpose: the design
 * tool and the certifier's portal must stay independent, so being signed into
 * the portal in another tab grants no access here.
 */
export async function studioIdentity(): Promise<StudioIdentity | null> {
  const c = (await cookies()).get(COOKIE)?.value;
  if (!c) return null;
  try {
    const { payload } = await jwtVerify(c, secret());
    if (payload.kind !== "studio" || typeof payload.email !== "string") return null;
    return { owner: `u:${payload.email}`, name: String(payload.name || payload.email) };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Designs
// ---------------------------------------------------------------------------

export interface DesignMeta {
  id: string;
  name: string;
  address: string;
  updatedAt: string;
  createdAt: string;
}

/** Enough for a serious builder's whole year; small enough that one owner's
 *  index row stays a sane size. */
const MAX_DESIGNS = 200;
/** A drawing is a few KB of JSON; half a megabyte means something's wrong. */
const MAX_DESIGN_BYTES = 512 * 1024;

const indexKey = (owner: string) => `studio_designs:${owner}`;
const designKey = (owner: string, id: string) => `studio_design:${owner}:${id}`;

export async function listDesigns(owner: string): Promise<DesignMeta[]> {
  const list = await repo.getSetting<DesignMeta[]>(indexKey(owner));
  return Array.isArray(list)
    ? [...list].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    : [];
}

async function writeIndex(owner: string, list: DesignMeta[]) {
  await repo.setSetting(indexKey(owner), list);
}

const newId = () =>
  `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export async function createDesign(
  owner: string, name: string, design?: unknown
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const list = await listDesigns(owner);
  if (list.length >= MAX_DESIGNS) {
    return { ok: false, error: "You've reached the design limit — delete one you no longer need first." };
  }
  const id = newId();
  const now = new Date().toISOString();
  const meta: DesignMeta = {
    id,
    name: String(name || "Untitled plan").trim().slice(0, 80) || "Untitled plan",
    address: "",
    updatedAt: now,
    createdAt: now,
  };
  if (design !== undefined) await repo.setSetting(designKey(owner, id), { design });
  await writeIndex(owner, [meta, ...list]);
  return { ok: true, id };
}

export async function getDesign(owner: string, id: string): Promise<unknown | null> {
  const row = await repo.getSetting<{ design?: unknown }>(designKey(owner, id));
  return row?.design ?? null;
}

export async function getDesignMeta(owner: string, id: string): Promise<DesignMeta | null> {
  return (await listDesigns(owner)).find((d) => d.id === id) ?? null;
}

export async function saveDesign(
  owner: string, id: string, design: unknown, address?: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (JSON.stringify(design ?? null).length > MAX_DESIGN_BYTES) {
    return { ok: false, error: "This design is too large to save." };
  }
  const list = await listDesigns(owner);
  const meta = list.find((d) => d.id === id);
  // Saving to an id that isn't yours (or doesn't exist) writes nothing.
  if (!meta) return { ok: false, error: "This design no longer exists." };
  await repo.setSetting(designKey(owner, id), { design });
  meta.updatedAt = new Date().toISOString();
  if (typeof address === "string") meta.address = address.trim().slice(0, 120);
  await writeIndex(owner, list);
  return { ok: true };
}

export async function renameDesign(owner: string, id: string, name: string): Promise<boolean> {
  const list = await listDesigns(owner);
  const meta = list.find((d) => d.id === id);
  if (!meta) return false;
  meta.name = String(name || "").trim().slice(0, 80) || meta.name;
  await writeIndex(owner, list);
  return true;
}

export async function duplicateDesign(
  owner: string, id: string
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const meta = await getDesignMeta(owner, id);
  if (!meta) return { ok: false, error: "This design no longer exists." };
  const design = await getDesign(owner, id);
  const copy = await createDesign(owner, `${meta.name} (copy)`, design ?? undefined);
  if (!copy.ok) return copy;
  // The copy keeps the address on its card so the list stays readable.
  const list = await listDesigns(owner);
  const m = list.find((d) => d.id === copy.id);
  if (m) { m.address = meta.address; await writeIndex(owner, list); }
  return copy;
}

export async function deleteDesign(owner: string, id: string): Promise<boolean> {
  const list = await listDesigns(owner);
  if (!list.some((d) => d.id === id)) return false;
  await writeIndex(owner, list.filter((d) => d.id !== id));
  await repo.setSetting(designKey(owner, id), null);
  return true;
}
