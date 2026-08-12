// Spec 2 — auth: wrong password says so generically, the per-username
// throttle locks after three free attempts (probed on a throwaway name so
// the fixture login is never locked for later specs), the staff door
// rejects a wrong passcode, and a dead session gets the pick-up-where-you-
// left-off message rather than a silent failure.
import test from "node:test";
import assert from "node:assert/strict";
import { request as pwRequest } from "playwright-core";
import { launch, BASE, waitText, CLIENT } from "./_setup.mjs";

test("auth: bad password, lockout, staff passcode, session expiry", async () => {
  const { browser, page } = await launch();
  const anon = await pwRequest.newContext();
  try {
    // Wrong password → generic error, no username oracle.
    await page.goto(`${BASE}/`);
    await page.fill("#username", CLIENT.username);
    await page.fill("#password", "definitely-wrong");
    await page.press("#password", "Enter");
    assert.ok(await waitText(page, /isn.t right|doesn.t match|didn.t work/i),
      "wrong password shows an error");
    assert.ok(!page.url().includes("dashboard"), "stays on the login page");

    // Throttle: three free strikes on a username that exists nowhere, then
    // the lock message with a wait and the phone number.
    for (let i = 0; i < 4; i++) {
      await anon.post(`${BASE}/api/auth/login`, {
        data: { username: "e2e.lockout.probe", password: "x".repeat(8) + i },
      });
    }
    const locked = await anon.post(`${BASE}/api/auth/login`, {
      data: { username: "e2e.lockout.probe", password: "one-more" },
    });
    assert.equal(locked.status(), 429, "locked attempt is throttled");
    const lockedBody = await locked.json();
    assert.match(lockedBody.error, /too many failed attempts/i, "lockout names itself");
    assert.match(lockedBody.error, /1300 029 074/, "lockout offers the office number");

    // Staff door: wrong passcode stays out (one attempt only — the staff
    // throttle is per IP and must not lock the rest of the suite out).
    await page.goto(`${BASE}/admin/login`);
    const pw = page.locator('input[type="password"]').first();
    await pw.fill("not-the-passcode");
    await pw.press("Enter");
    await page.waitForTimeout(800);
    assert.ok(!/\/admin(?!\/login)/.test(page.url()), "wrong passcode does not enter /admin");

    // Session expiry: the API says what happened in words a person can act on.
    const expired = await anon.post(`${BASE}/api/submit`, {
      multipart: { address: "1 Nowhere St" },
    });
    assert.equal(expired.status(), 401);
    assert.match((await expired.json()).error, /session has ended|sign in again/i, "expiry message present");

    // And a signed-out browser is walked back to the front door.
    const fresh = await browser.newPage();
    fresh.setDefaultTimeout(8000);
    await fresh.goto(`${BASE}/dashboard`);
    await fresh.waitForTimeout(600);
    assert.ok(!fresh.url().includes("/dashboard"), "signed-out /dashboard redirects to login");
    await fresh.close();
  } finally {
    await anon.dispose();
    await browser.close();
  }
});
