import { readFile } from "node:fs/promises";
import path from "node:path";
import * as repo from "@/lib/repo";
import { env } from "@/lib/env";
import { GUIDE_PATH, GUIDE_SHIPPED } from "@/lib/info-sheets";
import type { MailAttachment } from "@/lib/mail";

/**
 * The getting-started guide for a new client's login email.
 *
 * Three tiers, first hit wins:
 *   1. the storage override (swapped from /admin without a deploy);
 *   2. the copy SHIPPED IN THE BUNDLE, read straight off the function's
 *      filesystem — next.config's outputFileTracingIncludes packs
 *      public/guides into this route, so this tier cannot lose a network
 *      race with our own deployment;
 *   3. an HTTP fetch of the public file, kept only as the last resort.
 *
 * The first live trial went out with no guide because tier 3 was the ONLY
 * fallback and its failure was swallowed. Every miss now leaves a breadcrumb,
 * and all three missing writes an audit line the office can see.
 */
const GUIDE_FILENAME = "CFBA Client Portal — Getting Started.pdf";
let bundled: Buffer | null | undefined; // undefined = not tried yet

export async function guideAttachment(): Promise<MailAttachment | null> {
  try {
    const bytes = await repo.readFile(GUIDE_PATH);
    if (bytes.length) {
      return { name: GUIDE_FILENAME, contentType: "application/pdf", bytes };
    }
  } catch { /* nothing uploaded — the shipped copy is the normal case */ }

  if (bundled === undefined) {
    try {
      bundled = await readFile(path.join(process.cwd(), "public", "guides", "getting-started.pdf"));
    } catch (e) {
      bundled = null;
      console.warn("login guide: bundled copy unreadable:", (e as Error).message);
    }
  }
  if (bundled?.length) {
    return { name: GUIDE_FILENAME, contentType: "application/pdf", bytes: bundled };
  }

  try {
    const r = await fetch(`${env.appUrl}${GUIDE_SHIPPED}`, { cache: "no-store" });
    if (r.ok) {
      const bytes = Buffer.from(await r.arrayBuffer());
      if (bytes.length) return { name: GUIDE_FILENAME, contentType: "application/pdf", bytes };
      console.warn(`login guide: ${env.appUrl}${GUIDE_SHIPPED} answered empty`);
    } else {
      console.warn(`login guide: ${env.appUrl}${GUIDE_SHIPPED} answered ${r.status}`);
    }
  } catch (e) {
    console.warn("login guide: fetch failed:", (e as Error).message);
  }

  // All three tiers missed — say so where the office looks, then send the
  // email anyway (the login must never be blocked by its brochure).
  await repo.logAudit("guide.missing", GUIDE_SHIPPED, "login email sent without the guide").catch(() => {});
  return null;
}
