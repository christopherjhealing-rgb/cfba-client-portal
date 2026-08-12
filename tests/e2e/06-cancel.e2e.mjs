// Spec 6 — cancel is request-and-confirm, never a portal-side status write:
// the happy path posts the request and shows "with us to confirm"; asking
// twice is a polite 409; a certified job (the stale-tab case — the job
// moved on since the tab was opened) is a different polite 409.
import test from "node:test";
import assert from "node:assert/strict";
import { launch, loginClient, BASE, waitText, store } from "./_setup.mjs";

test("cancel: request + confirm banner, duplicate 409, certified 409", async () => {
  const { browser, page } = await launch();
  try {
    await loginClient(page);

    // Happy path on T-1002 (in assessment): request → banner.
    const first = await page.request.post(`${BASE}/api/jobs/T-1002/cancel`, {
      data: { reason: "E2E: builder pulled out" },
    });
    assert.equal(first.status(), 200, "cancel request accepted");
    await page.goto(`${BASE}/jobs/T-1002`);
    assert.ok(await waitText(page, /cancellation requested/i), "job page shows the requested banner");
    assert.ok(await waitText(page, /with us to confirm/i), "…and that CFBA confirms it");

    // The portal wrote a REQUEST marker, not a status: the job's board
    // status is untouched (board stays the system of record).
    assert.equal(store().jobs["T-1002"].mondayStatus, "To CDC", "board status untouched by the request");

    // Second ask → 409 with the already-asked message.
    const dup = await page.request.post(`${BASE}/api/jobs/T-1002/cancel`, {
      data: { reason: "again" },
    });
    assert.equal(dup.status(), 409, "duplicate request refused");
    assert.match((await dup.json()).error, /already asked us to cancel/i);

    // Stale tab: T-1001 is certified (issued + downloaded in spec 5) — the
    // portal explains rather than obeying.
    const certified = await page.request.post(`${BASE}/api/jobs/T-1001/cancel`, {
      data: { reason: "too late" },
    });
    assert.equal(certified.status(), 409, "certified job can't be cancelled from the portal");
    assert.match((await certified.json()).error, /certified|already cancelled/i);
    assert.match((await certified.json()).error, /1300 029 074|ring/i, "…and offers the phone");

    // And the already-cancelled seed job says exactly that.
    const done = await page.request.post(`${BASE}/api/jobs/T-1006/cancel`, {
      data: { reason: "n/a" },
    });
    assert.equal(done.status(), 409);
    assert.match((await done.json()).error, /already cancelled/i);
  } finally {
    await browser.close();
  }
});
