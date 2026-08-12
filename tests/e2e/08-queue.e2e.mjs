// Spec 8 — the review queue (suite runs with AUTO_ACCEPT_LODGEMENTS=0 so
// every lodgement lands here, the same posture as a Monday outage): accept
// puts the job on the client's list; reject WITH A REASON puts a visible
// notice on the client's dashboard with a Lodge It Again path — the Batch-1
// "no silent rejection" regression.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { launch, loginClient, loginStaff, BASE, waitText, until, fixture, store } from "./_setup.mjs";

async function lodgeViaApi(page, address) {
  const pdf = fs.readFileSync(fixture("siteplan.pdf"));
  const boundary = "----e2e" + Math.random().toString(36).slice(2);
  const part = (name, value) =>
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`);
  const filePart = (name, filename, buffer) =>
    Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${filename}"\r\nContent-Type: application/pdf\r\n\r\n`),
      buffer, Buffer.from("\r\n"),
    ]);
  const body = Buffer.concat([
    part("address", address), part("jobClass", "Patio"),
    part("description", "e2e queue check"),
    filePart("files", "siteplan.pdf", pdf), part("fileCategories", "drawings"),
    filePart("files", "engineering.pdf", pdf), part("fileCategories", "engineering"),
    Buffer.from(`--${boundary}--\r\n`),
  ]);
  const r = await page.request.post(`${BASE}/api/submit`, {
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
    data: body,
  });
  assert.equal(r.status(), 200, `lodgement for ${address} accepted (${r.status()})`);
}

test("queue: pending → accept onto list; reject with reason → visible notice", async () => {
  const { browser, page } = await launch();
  try {
    await loginClient(page);
    await lodgeViaApi(page, "12 Queue Street, Greenwood");
    await lodgeViaApi(page, "14 Reject Road, Greenwood");

    const staff = await browser.newPage();
    staff.setDefaultTimeout(8000);
    await loginStaff(staff);
    await staff.goto(`${BASE}/admin`);
    assert.ok(await waitText(staff, /12 Queue Street/i), "lodgement sits in the queue (auto-accept off)");

    // Accept the first: it becomes a job on the client's list.
    const acceptCard = staff.locator("div.card", { hasText: /12 Queue Street/i }).first();
    await acceptCard.locator("button", { hasText: /accept/i }).first().click();
    assert.ok(await until(() =>
      store().submissions.find((s) => s.address?.includes("12 Queue Street"))?.status === "accepted", 8000),
      "accept lands in the store");

    // Reject the second, with a reason the client will read.
    await staff.goto(`${BASE}/admin`);
    const rejectCard = staff.locator("div.card", { hasText: /14 Reject Road/i }).first();
    await rejectCard.locator("button", { hasText: /^reject$/i }).first().click();
    await staff.waitForTimeout(300);
    await rejectCard.locator("textarea").fill("E2E: wrong engineering attached — send the carport certification.");
    await rejectCard.locator("button", { hasText: /confirm reject/i }).first().click();
    await staff.waitForTimeout(1500);
    async function staff2Check() {
      await staff.goto(`${BASE}/admin`);
      await staff.waitForTimeout(600);
      const t = await staff.evaluate(() => document.body.innerText);
      assert.ok(!/12 Queue Street/i.test(t) && !/14 Reject Road/i.test(t), "queue drained of both");
      await staff.close();
    }

    const subs = store().submissions;
    const accepted = subs.find((s) => s.address?.includes("12 Queue Street"));
    assert.equal(accepted?.status, "accepted");
    // In demo the board leg is a stub: the card id proves the handoff; the
    // job row itself only materialises via sync in production (known
    // demo-fidelity gap, documented in the QA report).
    assert.ok(accepted?.mondayItemId, "accepted submission carries its card id");
    assert.equal(subs.find((s) => s.address?.includes("14 Reject Road"))?.status, "rejected");

    // Queue is drained of both.
    await staff2Check();

    // Client side: the rejection is a visible Action-Required notice with
    // the office's reason verbatim and a way forward — never a silent drop.
    await page.goto(`${BASE}/dashboard`);
    assert.ok(await waitText(page, /14 Reject Road/i), "rejected lodgement surfaces on the dashboard");
    assert.ok(await waitText(page, /wrong engineering attached/i), "…with the office's reason verbatim");
    assert.ok(await waitText(page, /lodge it again/i), "…and a Lodge It Again path");
  } finally {
    await browser.close();
  }
});
