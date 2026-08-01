// Renders every .html in this folder to an A4 PDF in ./pdf/.
//
// Needs a Chromium/Chrome to drive. Point CHROMIUM_PATH at one if the
// default doesn't exist on your machine, e.g. on Windows:
//   $env:CHROMIUM_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"
//   node render-pdfs.mjs
//
// Requires: npm install playwright-core
import { chromium } from "playwright-core";
import { readdirSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const DIR = dirname(fileURLToPath(import.meta.url));
const OUT = join(DIR, "pdf");
mkdirSync(OUT, { recursive: true });

const files = readdirSync(DIR).filter((f) => f.endsWith(".html"));
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium",
});
const page = await browser.newPage();
for (const f of files) {
  await page.goto(`file://${join(DIR, f)}`, { waitUntil: "load" });
  await page.pdf({
    path: join(OUT, f.replace(".html", ".pdf")),
    format: "A4",
    printBackground: true,
    margin: { top: 0, bottom: 0, left: 0, right: 0 },
  });
  console.log("rendered", f);
}
await browser.close();
