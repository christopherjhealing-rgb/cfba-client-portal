// Renders the site guidance-note masters in this folder to the PDFs the portal
// serves from /public/notes. Run after editing a master, then commit both.
// Same Chromium requirement as ../render-pdfs.mjs (CHROMIUM_PATH on Windows).
import { chromium } from "playwright-core";
import { readdirSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const DIR = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(DIR, "../../../public/notes");

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
