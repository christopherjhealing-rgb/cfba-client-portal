// Shared harness for the e2e regression suite (run via `npm run test:e2e`).
//
// Design constraints, in order:
//   - zero new dependencies: playwright-core (already a devDependency) +
//     node's built-in test runner, nothing else;
//   - never download a browser: resolve a Chromium/Chrome that already
//     exists on the machine (CHROMIUM_PATH wins, then well-known homes,
//     then Playwright's managed folder, then the installed Chrome channel);
//   - demo mode is the fixture: the suite runs against `next start` with a
//     private TMPDIR so the seeded demo store starts fresh every run and
//     store-level assertions read that same file.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

export const BASE = process.env.E2E_BASE || "http://localhost:3100";
export const STORE = process.env.E2E_STORE || "";
export const FIX = path.dirname(fileURLToPath(import.meta.url)) + "/fixtures";

export const CLIENT = { username: "cfba.test", password: "TestDryRun2026" };
export const STAFF_PASSCODE = process.env.E2E_STAFF_PASSCODE || "demo";

function firstExisting(cands) {
  for (const c of cands) if (c && fs.existsSync(c)) return c;
  return null;
}

/** A Chrome/Chromium binary that already exists — never a download. */
export function resolveChrome() {
  const managed = [];
  for (const root of [process.env.PLAYWRIGHT_BROWSERS_PATH, "/opt/pw-browsers"]) {
    if (!root || !fs.existsSync(root)) continue;
    for (const d of fs.readdirSync(root)) {
      if (d.startsWith("chromium")) {
        managed.push(path.join(root, d, "chrome-linux", "chrome"));
        managed.push(path.join(root, d, "chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium"));
      }
    }
  }
  return firstExisting([
    process.env.CHROMIUM_PATH,
    ...managed,
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ]);
}

export async function launch() {
  const executablePath = resolveChrome();
  const browser = await chromium.launch(
    executablePath ? { headless: true, executablePath } : { headless: true, channel: "chrome" }
  );
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  return { browser, context, page };
}

/** Client sign-in. Enter-press, not button click — matches the QA harness
 *  finding that the submit-button click path is flaky under CDP here. */
export async function loginClient(page, user = CLIENT) {
  await page.goto(`${BASE}/`);
  await page.fill("#username", user.username);
  await page.fill("#password", user.password);
  await page.press("#password", "Enter");
  await page.waitForURL(/dashboard/, { timeout: 10000 });
}

export async function loginStaff(page) {
  await page.goto(`${BASE}/admin/login`);
  const pw = page.locator('input[type="password"]').first();
  await pw.fill(STAFF_PASSCODE);
  await pw.press("Enter");
  await page.waitForURL(/\/admin(?!\/login)/, { timeout: 10000 });
}

/** The demo store, read fresh — server writes land before its responses
 *  return, so reading after an awaited action is race-free. */
export function store() {
  return JSON.parse(fs.readFileSync(STORE, "utf8"));
}

export function fixture(name) {
  return path.join(FIX, name);
}

/** innerText reflects CSS text-transform (chips uppercase), so every text
 *  probe in the suite must match case-insensitively. */
export async function bodyText(page) {
  return page.evaluate(() => document.body.innerText);
}

export async function has(page, re) {
  const t = await bodyText(page);
  return (re instanceof RegExp ? re : new RegExp(re, "i")).test(t);
}

/** Poll until truthy. One-shot innerText probes race the first-landing
 *  entrance cascade and route streaming; every post-navigation text
 *  assertion goes through here instead. */
export async function until(fn, ms = 6000, step = 250) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v || Date.now() > end) return v;
    await new Promise((r) => setTimeout(r, step));
  }
}

export function waitText(page, re, ms = 6000) {
  return until(() => has(page, re), ms);
}
