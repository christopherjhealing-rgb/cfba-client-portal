// Spec 10 — the office side: an enquiry (no card, no sync — email is its
// only other trace) makes the round trip client → /admin/enquiries →
// client; and the working pages render — email log, activity log,
// feedback (with the suite's own events tallied), reports, pre-flight.
import test from "node:test";
import assert from "node:assert/strict";
import { launch, loginClient, loginStaff, BASE, waitText, until, store } from "./_setup.mjs";

test("admin: enquiry round trip + working pages render", async () => {
  const { browser, page } = await launch();
  try {
    // Client sends a general enquiry from Messages.
    await loginClient(page);
    await page.goto(`${BASE}/messages?ref=GENERAL`);
    await page.fill("#enquiry-subject", "Retaining walls in Stirling");
    await page.fill("#reply", "E2E enquiry: do you cover Class 10b retaining walls in Stirling?");
    await page.locator("button", { hasText: /send enquiry/i }).first().click();
    assert.ok(await until(() =>
      (store().messages || []).some((m) => m.ref === "GENERAL" && /class 10b/i.test(m.body)), 8000),
      "enquiry stored on the GENERAL thread");

    // Staff sees it and replies.
    const staff = await browser.newPage();
    staff.setDefaultTimeout(8000);
    await loginStaff(staff);
    await staff.goto(`${BASE}/admin/enquiries`);
    assert.ok(await waitText(staff, /class 10b retaining walls/i), "enquiry landed with staff");
    await staff.fill("textarea", "E2E answer: yes — Stirling is covered, lodge as usual.");
    await staff.locator("button", { hasText: /send reply/i }).first().click();
    await staff.waitForTimeout(2000);

    // Client sees the answer in the same thread.
    await page.goto(`${BASE}/messages`);
    assert.ok(await waitText(page, /stirling is covered/i), "reply reached the client thread");

    // Working pages render with their furniture (no blank 500 walls).
    await staff.goto(`${BASE}/admin/emails`);
    assert.ok(await waitText(staff, /email|send log|sent/i), "email log renders");
    await staff.goto(`${BASE}/admin/audit`);
    assert.ok(await waitText(staff, /activity|audit|action/i), "activity log renders");
    await staff.goto(`${BASE}/admin/feedback`);
    assert.ok(await waitText(staff, /weekly counts|feedback/i), "feedback page renders");
    assert.ok(await waitText(staff, /lodgements started/i), "…with the pilot dials");
    await staff.goto(`${BASE}/admin/reports`);
    assert.ok(await waitText(staff, /turnaround|issued/i), "reports page renders");
    await staff.goto(`${BASE}/admin`);
    assert.ok(await waitText(staff, /go-live pre-flight/i), "pre-flight card present on /admin");
    await staff.close();
  } finally {
    await browser.close();
  }
});
