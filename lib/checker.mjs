// Decrypts the patio checker payload committed at lib/checker-payload.json.
// The payload is produced by the engineeringchecker repo's encrypt step
// (WebCrypto: PBKDF2-SHA256 → AES-256-GCM), so the format here must mirror
// what that page's own unlock script expects: base64 salt/iv/ciphertext,
// with the 16-byte GCM auth tag appended to the ciphertext.
import { pbkdf2Sync, createDecipheriv } from "node:crypto";

export function decryptChecker(payload, password) {
  const salt = Buffer.from(payload.s, "base64");
  const iv = Buffer.from(payload.i, "base64");
  const data = Buffer.from(payload.c, "base64");
  const key = pbkdf2Sync(password, salt, payload.n, 32, "sha256");
  const tag = data.subarray(data.length - 16);
  const body = data.subarray(0, data.length - 16);
  const d = createDecipheriv("aes-256-gcm", key, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(body), d.final()]).toString("utf8");
}
