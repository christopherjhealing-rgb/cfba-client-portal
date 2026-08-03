import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PORTAL_FORMS, FORM_EXTS, FORM_MIME, FORM_LABEL,
  formExtOf, formFileNames, isFormFile, hostedFormFile,
} from "../lib/resources.ts";

test("the form registry has no duplicate keys or codes", () => {
  const keys = PORTAL_FORMS.map((f) => f.key);
  const codes = PORTAL_FORMS.map((f) => f.code);
  assert.equal(new Set(keys).size, keys.length, "duplicate key");
  assert.equal(new Set(codes).size, codes.length, "duplicate code");
  // The key is what the storage path is built from, so it has to stay a plain
  // slug — anything else and forms/<key>.<ext> stops being one path segment.
  for (const k of keys) assert.match(k, /^[a-z0-9]+$/, `bad key: ${k}`);
});

test("BA7 is there, and every form says what it's for", () => {
  const ba7 = PORTAL_FORMS.find((f) => f.code === "BA7");
  assert.ok(ba7, "BA7 missing");
  assert.equal(ba7.title, "Notice of Completion");
  for (const f of PORTAL_FORMS) {
    assert.ok(f.title.trim(), `${f.code} has no title`);
    assert.ok(f.note.trim(), `${f.code} has no note`);
  }
});

test("a form is recognised in every format we host, and nothing else", () => {
  for (const f of PORTAL_FORMS) {
    for (const ext of FORM_EXTS) assert.ok(isFormFile(`${f.key}.${ext}`), `${f.key}.${ext}`);
  }
  // Not a registered form, not a format we host, and — the one that matters —
  // nothing that would walk out of the forms folder.
  const bad = [
    "ba99.pdf", "ba1.exe", "ba1.pdf.exe", "ba1", "ba1.PDF ",
    "../secrets.pdf", "ba1/../../secrets.pdf", "forms/ba1.pdf", "",
  ];
  for (const f of bad) assert.equal(isFormFile(f), false, `should refuse ${JSON.stringify(f)}`);
});

test("the extension decides the type, and an unknown one is refused", () => {
  assert.equal(formExtOf("ba1.pdf"), "pdf");
  assert.equal(formExtOf("BA1.DOCX"), "docx");
  assert.equal(formExtOf("ba1.doc"), "doc");
  assert.equal(formExtOf("ba1.exe"), null);
  assert.equal(formExtOf("ba1"), null);
  assert.equal(formExtOf(""), null);
  // Every hostable format needs a MIME type and a word for it, or the browser
  // gets served a Word file labelled as a PDF.
  for (const ext of FORM_EXTS) {
    assert.ok(FORM_MIME[ext], `no MIME for ${ext}`);
    assert.ok(FORM_LABEL[ext], `no label for ${ext}`);
  }
});

test("the hosted file is whichever format was uploaded", () => {
  assert.equal(hostedFormFile("ba7", []), null);
  assert.deepEqual(hostedFormFile("ba7", ["ba7.docx"]), { file: "ba7.docx", ext: "docx" });
  assert.deepEqual(hostedFormFile("ba7", ["ba7.pdf"]), { file: "ba7.pdf", ext: "pdf" });
  // Another form's file is not this one's.
  assert.equal(hostedFormFile("ba7", ["ba1.pdf"]), null);
  // Uploading replaces rather than adds, so two shouldn't coexist — but if
  // they ever do, serve the one every client can open.
  assert.equal(hostedFormFile("ba7", ["ba7.docx", "ba7.pdf"]).ext, "pdf");
});

test("removing a form clears every format it could be under", () => {
  const names = formFileNames("ba7");
  assert.deepEqual(names, ["ba7.pdf", "ba7.docx", "ba7.doc"]);
  // Whatever hostedFormFile could find, formFileNames must be able to delete —
  // or a replaced form leaves last year's version downloadable.
  for (const ext of FORM_EXTS) assert.ok(names.includes(`ba7.${ext}`));
});
