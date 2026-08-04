import { env } from "./env";
import * as repo from "./repo";
import { tidyUrl, rewriteLinks } from "./url.mjs";

/**
 * Where the portal actually lives, as far as an emailed link is concerned.
 *
 * This exists because APP_URL is the one setting that can be wrong without
 * breaking anything visibly. A dead value doesn't fail a build, doesn't throw,
 * doesn't show up in a log — it just puts a button in a client's inbox that
 * goes nowhere, and nobody finds out until a client says so. That happened.
 *
 * So the address is settable from /admin as well as from the environment, and
 * the setting wins. Fixing a dead link should not require a deploy, an
 * environment variable, or anybody's Vercel password.
 *
 * Deliberately NOT cached in module state. Next bundles route handlers and
 * server components separately, so a cache set when the address is saved is
 * not the cache read when the next email goes out — the setting would appear
 * to have been ignored, which is the exact failure this is here to end. It's
 * one indexed row per email; correctness is worth more than the read.
 */
const SETTING_KEY = "app_url";

export async function resolveAppUrl(): Promise<string> {
  let url = "";
  try {
    const s = await repo.getSetting<{ url?: string }>(SETTING_KEY);
    url = tidyUrl(s?.url || "");
  } catch {
    // A settings read that fails must never stop an email going out.
  }
  return url || env.appUrl;
}

export async function setAppUrl(url: string): Promise<string> {
  const clean = tidyUrl(url);
  await repo.setSetting(SETTING_KEY, { url: clean });
  return clean || env.appUrl;
}

/** What's stored, ignoring the environment fallback — so /admin can show
 *  whether the address is an override or just what the deployment was given. */
export async function storedAppUrl(): Promise<string> {
  try {
    const s = await repo.getSetting<{ url?: string }>(SETTING_KEY);
    return tidyUrl(s?.url || "");
  } catch {
    return "";
  }
}

export { tidyUrl, rewriteLinks };
