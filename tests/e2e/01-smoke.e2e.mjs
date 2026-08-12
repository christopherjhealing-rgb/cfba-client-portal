// Spec 1 — smoke: both logins land, the dashboard carries its furniture,
// and the notifications poll answers 200 signed-in / 401 signed-out.
import test from "node:test";
import assert from "node:assert/strict";
import { request as pwRequest } from "playwright-core";
import { launch, loginClient, loginStaff, BASE, waitText } from "./_setup.mjs";

test("smoke: client login, dashboard, notifications, staff login", async () => {
  const { browser, page } = await launch();
  try {
    await loginClient(page);
    assert.ok(await waitText(page, /my jobs/i), "dashboard shows My Jobs nav");
    assert.ok(await waitText(page, /lodge a job/i), "dashboard shows Lodge a Job");

    const notif = await page.request.get(`${BASE}/api/notifications`);
    assert.equal(notif.status(), 200, "notifications 200 when signed in");
    const body = await notif.json();
    assert.ok("unread" in body || "jobs" in body || Object.keys(body).length > 0, "notifications payload has content");

    const anon = await pwRequest.newContext();
    const signedOut = await anon.get(`${BASE}/api/notifications`);
    assert.equal(signedOut.status(), 401, "notifications 401 when signed out");
    await anon.dispose();

    const staff = await browser.newPage();
    staff.setDefaultTimeout(8000);
    await loginStaff(staff);
    assert.ok(await waitText(staff, /submission queue/i), "staff queue page renders");
    await staff.close();
  } finally {
    await browser.close();
  }
});
