// Spec 9 — tenant walls: another company's ref is a 404 not a leak, client
// sessions can't reach staff pages, and impersonation (staff viewing as a
// client) is bannered and write-blocked — messages 403; feedback is
// recorded as STAFF, never in the client's voice (the Batch-4 contract).
import test from "node:test";
import assert from "node:assert/strict";
import { launch, loginClient, loginStaff, BASE, has, waitText, store } from "./_setup.mjs";

test("permissions: foreign refs 404, staff pages gated, impersonation write-blocked", async () => {
  const { browser, page } = await launch();
  try {
    await loginClient(page);

    // 56411 belongs to Perth Patios, not the test client.
    const foreignApi = await page.request.get(`${BASE}/api/jobs/56411/download`);
    assert.ok([403, 404].includes(foreignApi.status()), `foreign download blocked (${foreignApi.status()})`);
    const foreignMsg = await page.request.post(`${BASE}/api/messages`, {
      data: { ref: "56411", body: "should never land" },
    });
    assert.ok(foreignMsg.status() >= 400, `foreign message blocked (${foreignMsg.status()})`);
    const foreignCancel = await page.request.post(`${BASE}/api/jobs/56411/cancel`, { data: {} });
    assert.ok(foreignCancel.status() >= 400, `foreign cancel blocked (${foreignCancel.status()})`);
    await page.goto(`${BASE}/jobs/56411`);
    assert.ok(!(await has(page, /32 Elvira/i)), "foreign job page shows nothing of the job");

    // A client session is not a staff session.
    await page.goto(`${BASE}/admin`);
    await page.waitForTimeout(600);
    assert.ok(/admin\/login/.test(page.url()), "client hitting /admin lands on the staff login");

    // Impersonation: staff → Clients → view as the test client.
    const staff = await browser.newPage();
    staff.setDefaultTimeout(8000);
    await loginStaff(staff);
    await staff.goto(`${BASE}/admin/clients`);
    await staff.locator("a, button", { hasText: /view/i }).first().click();
    await staff.waitForTimeout(1500);
    assert.ok(await waitText(staff, /viewing as|impersonat|staff view/i), "impersonation is bannered");

    const impMsg = await staff.request.post(`${BASE}/api/messages`, {
      data: { ref: "T-1002", body: "impersonated write attempt" },
    });
    assert.equal(impMsg.status(), 403, "impersonated message write is 403");

    const before = (store().audit || []).filter((a) => a.action === "feedback").length;
    const impFb = await staff.request.post(`${BASE}/api/feedback`, {
      data: { category: "idea", body: "e2e impersonated feedback probe" },
    });
    assert.ok([200, 403].includes(impFb.status()), `feedback while impersonating: ${impFb.status()}`);
    if (impFb.status() === 200) {
      const fb = (store().audit || []).filter((a) => a.action === "feedback");
      assert.equal(fb.length, before + 1, "feedback recorded once");
      const mine = fb.find((a) => (a.detail || "").includes("impersonated feedback probe"));
      assert.equal(mine?.actor, "staff", "impersonated feedback is attributed to STAFF, never the client");
    }
    await staff.close();
  } finally {
    await browser.close();
  }
});
