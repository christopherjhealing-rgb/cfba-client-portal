// Copy the installed pdf.js worker into public/ so the studio's house-plan
// underlay can render a PDF page in the browser. Kept out of git and copied
// fresh from node_modules on every dev/build, so the worker can never drift
// out of step with the pdfjs-dist the app actually imports — a mismatch throws
// at runtime, which is exactly the failure a checked-in copy would invite.
import { copyFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs");
const destDir = join(root, "public");
const dest = join(destDir, "pdf.worker.min.mjs");

try {
  await mkdir(destDir, { recursive: true });
  await copyFile(src, dest);
  console.log("copied pdf.js worker -> public/pdf.worker.min.mjs");
} catch (err) {
  // Not fatal: without it the house-plan underlay simply can't render PDFs
  // (images still work). Never break a build over an optional feature's asset.
  console.warn("could not copy pdf.js worker:", err?.message ?? err);
}
