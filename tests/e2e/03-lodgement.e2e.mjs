// Spec 3 — lodgement: the gate names what's missing, refusals are visible,
// the combine step renames what's stored, a double-click lodges exactly
// once, and the Batch-1 regressions stay dead (awkward names accepted,
// collisions suffixed, oversize refused with the 40 MB message).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { launch, loginClient, BASE, waitText, store, fixture } from "./_setup.mjs";

const ADDRESS = "9 Verification Way, Greenwood";

test("lodgement: gates, visible refusal, combine names, double-click, tolerant intake", async () => {
  const { browser, page } = await launch();
  try {
    await loginClient(page);
    await page.goto(`${BASE}/submit`);

    // Disabled until complete, with the missing pieces NAMED.
    await page.fill("#address", ADDRESS);
    await page.selectOption("#type-0", { index: 1 });
    await page.fill("#qty-0", "1");
    await page.waitForTimeout(400);
    const lodge = page.locator("button", { hasText: /lodge this job/i }).first();
    assert.equal(await lodge.isDisabled(), true, "lodge stays disabled without files");
    assert.ok(await waitText(page, /still needed/i), "the missing pieces are named");

    // A .txt is refused VISIBLY — named, never silently dropped.
    const inputs = page.locator('input[type="file"]');
    await inputs.nth(0).setInputFiles(fixture("notes.txt"));
    assert.ok(await waitText(page, /left out/i), "non-PDF refusal line appears");
    assert.ok(await waitText(page, /notes\.txt/i), "…and names the file");

    // Real files in, lodge — and double-click the button to prove exactly
    // one submission results.
    await inputs.nth(0).setInputFiles(fixture("siteplan.pdf"));
    await inputs.nth(1).setInputFiles(fixture("engineering.pdf"));
    await page.waitForTimeout(500);

    // The strata question is compulsory: files alone must NOT arm the button.
    assert.equal(await lodge.isDisabled(), true, "lodge still held by the unanswered strata question");
    assert.ok(await waitText(page, /is the lot part of a strata/i), "…and the hold is named");
    const strataNo = page.locator('[role="group"][aria-label*="strata" i] button', { hasText: /^no$/i });
    await strataNo.click();
    await page.waitForTimeout(400);
    assert.equal(await lodge.isEnabled(), true, "lodge arms once files attach and strata is answered");
    await lodge.dblclick();
    assert.ok(await waitText(page, /lodged|received|my jobs/i, 12000), "success card renders");
    await page.waitForTimeout(600);

    const subs = store().submissions.filter((s) => s.address === ADDRESS);
    assert.equal(subs.length, 1, "double-click lodged exactly once");

    // The combine step renamed what was stored — site-and-date names, not
    // whatever the files were called on the client's desktop.
    const names = subs[0].files.map((f) => f.name);
    assert.ok(names.some((n) => /^Site Plan and Elevations - 9 Verification Way/i.test(n)),
      `drawings combined + renamed (got: ${names.join(", ")})`);
    assert.ok(names.some((n) => /^Engineering - 9 Verification Way/i.test(n)),
      "engineering combined + renamed");

    // Batch-1 regressions, driven at the API (same session cookie): an
    // em-dash filename is accepted, and a name collision gains -2 rather
    // than overwriting.
    const pdf = fs.readFileSync(fixture("siteplan.pdf"));
    const emdash = await page.request.post(`${BASE}/api/submit`, {
      multipart: {
        address: "7 Apostrophe Lane, Greenwood",
        jobClass: "Patio", description: "e2e tolerant-intake check", notes: "",
        files: { name: "plan.pdf", mimeType: "application/pdf", buffer: pdf },
        fileCategories: "drawings",
      },
    });
    // one part per field name via multipart object; repeated parts need the
    // form-data escape hatch below, so this first post carries drawings only
    // and must be told what else is missing.
    assert.equal(emdash.status(), 400, "drawings alone still refused server-side");
    assert.match((await emdash.json()).error, /engineering/i, "server names the missing category");

    const boundaryPost = async (parts) => {
      const boundary = "----e2e" + Math.random().toString(36).slice(2);
      const chunks = [];
      for (const p of parts) {
        chunks.push(Buffer.from(`--${boundary}\r\n`));
        if (p.filename !== undefined) {
          chunks.push(Buffer.from(
            `Content-Disposition: form-data; name="${p.name}"; filename="${p.filename}"\r\n` +
            `Content-Type: ${p.type || "application/pdf"}\r\n\r\n`));
          chunks.push(p.buffer, Buffer.from("\r\n"));
        } else {
          chunks.push(Buffer.from(`Content-Disposition: form-data; name="${p.name}"\r\n\r\n${p.value}\r\n`));
        }
      }
      chunks.push(Buffer.from(`--${boundary}--\r\n`));
      return page.request.post(`${BASE}/api/submit`, {
        headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
        data: Buffer.concat(chunks),
      });
    };

    const tolerant = await boundaryPost([
      { name: "address", value: "7 Apostrophe Lane, Greenwood" },
      { name: "jobClass", value: "Patio" },
      { name: "description", value: "e2e tolerant-intake check" },
      { name: "files", filename: "siteplan.pdf", buffer: pdf },
      { name: "fileCategories", value: "drawings" },
      { name: "files", filename: "engineering.pdf", buffer: pdf },
      { name: "fileCategories", value: "engineering" },
      { name: "files", filename: "Consultant Report — em dash.pdf", buffer: pdf },
      { name: "fileCategories", value: "other" },
      { name: "files", filename: "Extra.pdf", buffer: pdf },
      { name: "fileCategories", value: "other" },
      { name: "files", filename: "Extra.pdf", buffer: pdf },
      { name: "fileCategories", value: "other" },
    ]);
    assert.equal(tolerant.status(), 200, `tolerant intake accepted (${tolerant.status()})`);
    const sub2 = store().submissions.find((s) => s.address === "7 Apostrophe Lane, Greenwood");
    assert.ok(sub2, "second submission stored");
    const n2 = sub2.files.map((f) => f.name);
    assert.ok(n2.some((n) => /em dash/i.test(n)), `em-dash filename survives intake (got: ${n2.join(", ")})`);
    assert.ok(n2.some((n) => /^Extra\.pdf$/i.test(n)) && n2.some((n) => /^Extra-2\.pdf$/i.test(n)),
      `collision gains -2, nothing overwritten (got: ${n2.join(", ")})`);

    // Oversize: one 41 MB part → the 40 MB refusal, with the email path out.
    const big = Buffer.alloc(41 * 1024 * 1024, 37);
    const oversize = await boundaryPost([
      { name: "address", value: "8 Oversize Rise, Greenwood" },
      { name: "jobClass", value: "Patio" },
      { name: "description", value: "e2e oversize check" },
      { name: "files", filename: "siteplan.pdf", buffer: pdf },
      { name: "fileCategories", value: "drawings" },
      { name: "files", filename: "huge.pdf", buffer: big },
      { name: "fileCategories", value: "engineering" },
    ]);
    assert.equal(oversize.status(), 413, "oversize refused with 413");
    assert.match((await oversize.json()).error, /40 MB/i, "…and says the limit out loud");
    assert.ok(!store().submissions.some((s) => s.address?.includes("Oversize Rise")),
      "nothing stored for the refused lodgement");
  } finally {
    await browser.close();
  }
});
