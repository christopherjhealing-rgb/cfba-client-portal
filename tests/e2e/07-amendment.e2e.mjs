// Spec 7 — amendment: a client asks for a change against a real issued job
// through /amend; the request lands with staff as WAITING. No Monday card
// is created for it (an amendment is a re-issue, not a fresh assessment).
import test from "node:test";
import assert from "node:assert/strict";
import { launch, loginClient, loginStaff, BASE, waitText, fixture } from "./_setup.mjs";

test("amendment: lodge against T-1005, staff sees it WAITING", async () => {
  const { browser, page } = await launch();
  try {
    await loginClient(page);
    await page.goto(`${BASE}/amend`);

    // Pick the job by typing its site and choosing it from the list.
    await page.fill("#job", "5 Test Street");
    await page.waitForTimeout(900); // debounced lookup
    const option = page.locator("button", { hasText: /5 Test Street/i }).first();
    if (await option.count()) await option.click();
    await page.waitForTimeout(300);

    await page.fill("#what", "Move the rear door 300mm south; frame unchanged.");
    await page.setInputFiles("#files", fixture("revised-drawing.pdf"));
    await page.waitForTimeout(300);
    const send = page.locator("button", { hasText: /request the amendment/i }).first();
    assert.equal(await send.isEnabled(), true, "amendment form armed once a job is picked");
    await send.click();
    await page.waitForTimeout(2500);
    assert.ok(await waitText(page, /received|thanks|with us|sent/i, 8000), "client sees the confirmation");

    // Staff side: the amendment queue shows it as waiting.
    const staff = await browser.newPage();
    staff.setDefaultTimeout(8000);
    await loginStaff(staff);
    await staff.goto(`${BASE}/admin/amendments`);
    const t = await staff.evaluate(() => document.body.innerText);
    assert.match(t, /5 Test Street/i, "the amendment lists the job's site");
    assert.match(t, /waiting/i, "…marked WAITING for a decision");
    assert.match(t, /300mm/i, "…with the client's words attached");
    await staff.close();
  } finally {
    await browser.close();
  }
});
