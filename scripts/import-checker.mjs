// Refreshes lib/checker-payload.json from the engineeringchecker repo after
// the checker is updated there:
//
//   node scripts/import-checker.mjs ../engineeringchecker/index.html
//
// Commit the changed JSON and the portal serves the new build. The password
// only changes if the checker was re-encrypted — update CHECKER_PASSWORD on
// Vercel to match when it does.
import { readFileSync, writeFileSync } from "node:fs";

const src = process.argv[2];
if (!src) {
  console.error("Usage: node scripts/import-checker.mjs <path to engineeringchecker index.html>");
  process.exit(1);
}

const html = readFileSync(src, "utf8");
const m = html.match(
  /<script (?:id="payload" type="application\/json"|type="application\/json" id="payload")>([\s\S]*?)<\/script>/
);
if (!m) {
  console.error("No encrypted payload found in " + src);
  process.exit(1);
}

const p = JSON.parse(m[1]);
for (const k of ["s", "i", "c", "n"]) {
  if (!(k in p)) {
    console.error(`Payload is missing "${k}" — has the encryption format changed?`);
    process.exit(1);
  }
}

const dest = new URL("../lib/checker-payload.json", import.meta.url);
writeFileSync(dest, JSON.stringify(p));
console.log(`Wrote ${Buffer.from(p.c, "base64").length} encrypted bytes to lib/checker-payload.json`);
