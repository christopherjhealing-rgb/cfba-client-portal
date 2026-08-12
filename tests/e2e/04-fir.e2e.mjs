// Spec 4 — FIR: the ball-in-court flip. T-1003 sits amber ("we need
// something from you"); the client replies with a note and a PDF; the
// banner flips to "Answer sent — it's with us", the attachment is stored
// under its dated site name, and the job leaves the dashboard's Action
// Required. (Re-arm on a changed ask is unit-covered — firAnswered.)
import test from "node:test";
import assert from "node:assert/strict";
import { launch, loginClient, BASE, has, waitText, store, fixture } from "./_setup.mjs";

test("fir: reply flips the banner, renames the file, clears Action Required", async () => {
  const { browser, page } = await launch();
  try {
    await loginClient(page);
    await page.goto(`${BASE}/jobs/T-1003`);
    assert.ok(await waitText(page, /we need something from you/i), "amber FIR banner shows before the reply");

    // Reply with a note and one PDF in the Updated Drawings bucket.
    await page.fill("#fir-reply", "E2E: engineering certification attached — wind region A, TC2.");
    await page.locator('input[type="file"]').first().setInputFiles(fixture("revised-drawing.pdf"));
    await page.waitForTimeout(400);
    await page.locator("button", { hasText: /send to cfba/i }).first().click();
    await page.waitForTimeout(3500); // send + page reload

    await page.goto(`${BASE}/jobs/T-1003`);
    assert.ok(await waitText(page, /answer sent/i), "banner flips to Answer sent");
    assert.ok(!(await has(page, /we need something from you/i)), "amber banner is gone");
    assert.ok(await waitText(page, /wind region A/i), "the reply is in the thread");

    // The stored attachment carries the dated site name, not the desktop name.
    const msgs = store().messages.filter((m) => m.ref === "T-1003" && m.from === "client");
    const last = msgs[msgs.length - 1];
    const names = (last.files || []).map((f) => f.name || f.filename || String(f));
    assert.ok(names.length >= 1, "reply stored with its attachment");
    assert.ok(!names.some((n) => /revised-drawing\.pdf/i.test(n)),
      `attachment renamed away from the desktop name (got: ${names.join(", ")})`);
    assert.ok(names.some((n) => /test street|updated/i.test(n)),
      `…to the site's dated name (got: ${names.join(", ")})`);

    // Dashboard: T-1003 no longer sits in Action Required.
    await page.goto(`${BASE}/dashboard`);
    const sections = page.locator("section", { hasText: /action required/i });
    if (await sections.count()) {
      const txt = await sections.first().innerText();
      assert.ok(!/3 Test Street/i.test(txt), "T-1003 left Action Required");
    }
    assert.ok(await waitText(page, /answer sent|with us/i), "answered state visible somewhere on the dashboard");
  } finally {
    await browser.close();
  }
});
