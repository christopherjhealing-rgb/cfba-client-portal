import crypto from "crypto";
import { env } from "./env";

// --- passwords -------------------------------------------------------------
// scrypt with a per-password salt. Stored as "scrypt$<saltHex>$<hashHex>".

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password.normalize("NFKC"), salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored) return false;
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  try {
    const expected = Buffer.from(hashHex, "hex");
    const actual = crypto.scryptSync(
      password.normalize("NFKC"),
      Buffer.from(saltHex, "hex"),
      expected.length
    );
    return crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function passwordProblem(password: string): string | null {
  if (!password || password.length < 10) {
    return "Use at least 10 characters.";
  }
  if (/^\d+$/.test(password)) {
    return "Use more than just numbers.";
  }
  // Catch passwords that are essentially just a common word with digits or
  // punctuation bolted on ("Password123", "cfba!!!!"), without rejecting a
  // perfectly good password that happens to contain one of those words.
  const letters = password.toLowerCase().replace(/[^a-z]/g, "");
  const weak = ["password", "passw", "qwerty", "letmein", "welcome", "cfba", "portal", "building"];
  if (weak.includes(letters)) {
    return "That password is too easy to guess — try a phrase you'll remember.";
  }
  if (/^(.)\1+$/.test(password.replace(/\s/g, ""))) {
    return "That password is too easy to guess — try a phrase you'll remember.";
  }
  return null;
}

// --- usernames -------------------------------------------------------------
export function normUsername(u: string | null | undefined): string {
  return (u || "").toString().trim().toLowerCase().replace(/\s+/g, "");
}

export function suggestUsername(companyName: string): string {
  const base = (companyName || "")
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .join("");
  return base || "client";
}

// --- one-time setup codes (issued by staff, used once to set a password) ----
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1

export function newSetupCode(): string {
  const bytes = crypto.randomBytes(9);
  let out = "";
  for (let i = 0; i < 9; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
    if (i === 2 || i === 5) out += "-";
  }
  return out; // e.g. K7M-2QP-XR4
}

export function hashSetupCode(username: string, code: string): string {
  return crypto
    .createHmac("sha256", env.authSecret)
    .update(`${normUsername(username)}:${code.toUpperCase().replace(/[^A-Z0-9]/g, "")}`)
    .digest("hex");
}

export function setupCodeMatches(username: string, code: string, stored: string | null): boolean {
  if (!stored) return false;
  const a = Buffer.from(hashSetupCode(username, code), "hex");
  const b = Buffer.from(stored, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
