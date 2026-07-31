import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomBytes, pbkdf2Sync, createCipheriv } from "node:crypto";
import { decryptChecker } from "../lib/checker.mjs";

// Mirrors the encrypt step the engineeringchecker repo uses (WebCrypto
// PBKDF2-SHA256 → AES-256-GCM, tag appended to the ciphertext), so a
// round-trip here proves decryptChecker reads the real payload format.
function encrypt(html, password, n = 1500) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = pbkdf2Sync(password, salt, n, 32, "sha256");
  const c = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([c.update(html, "utf8"), c.final()]);
  return {
    s: salt.toString("base64"),
    i: iv.toString("base64"),
    c: Buffer.concat([body, c.getAuthTag()]).toString("base64"),
    n,
  };
}

test("round-trips a WebCrypto-format payload", () => {
  const html = "<!doctype html><title>Checker</title><p>span tables — ✓</p>";
  assert.equal(decryptChecker(encrypt(html, "pw"), "pw"), html);
});

test("wrong password throws rather than returning garbage", () => {
  assert.throws(() => decryptChecker(encrypt("<p>x</p>", "right"), "wrong"));
});

test("committed payload has the expected shape", () => {
  const p = JSON.parse(
    readFileSync(new URL("../lib/checker-payload.json", import.meta.url), "utf8")
  );
  assert.equal(Buffer.from(p.s, "base64").length, 16);
  assert.equal(Buffer.from(p.i, "base64").length, 12);
  assert.ok(Buffer.from(p.c, "base64").length > 1000);
  assert.ok(p.n >= 100_000);
});
