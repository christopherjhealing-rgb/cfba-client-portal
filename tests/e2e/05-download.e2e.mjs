// Spec 5 — download: the zip really carries bytes, the job regroups to
// Downloaded, permanence holds inside the window (T-1005, downloaded a
// fortnight ago, still visible), and the retention line says 3 months and
// offers the office as the path afterwards — never "forever".
import test from "node:test";
import assert from "node:assert/strict";
import { launch, loginClient, BASE, has, waitText, store } from "./_setup.mjs";

test("download: zip bytes, regroup, permanence window, retention wording", async () => {
  const { browser, page } = await launch();
  try {
    await loginClient(page);
    await page.goto(`${BASE}/downloads`);
    assert.ok(await waitText(page, /1 Test Street/i), "T-1001 (ready) is offered");
    assert.ok(await has(page, /5 Test Street/i), "T-1005 (downloaded 14d ago) is still visible");
    assert.ok(await has(page, /3 months/i), "retention wording present");
    assert.ok(await has(page, /1300 029 074/), "…with the ring-us path for later");
    assert.ok(!(await has(page, /forever|any ?time you like/i)), "never promises forever");

    // The package itself, fetched with the page's own cookies off the same
    // route the page's Download button uses — a real zip, not a stub.
    const zip = await page.request.get(`${BASE}/api/jobs/T-1001/download`);
    assert.equal(zip.status(), 200, "zip download answers 200");
    const body = await zip.body();
    assert.ok(body.length > 500, `zip has real bytes (${body.length})`);
    assert.equal(body[0], 0x50, "zip magic P");
    assert.equal(body[1], 0x4b, "zip magic K");

    // The download stamped the job — it regroups out of Ready.
    const j = store().jobs["T-1001"];
    assert.ok(j.firstDownloadedAt, "firstDownloadedAt stamped by the download");
  } finally {
    await browser.close();
  }
});
