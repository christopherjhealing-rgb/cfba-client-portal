import { PDFDocument } from "pdf-lib";

/**
 * Merge PDFs into one, in the order given, pages kept in order.
 *
 * Pages are copied, not rasterised — a merged drawing set stays as crisp and
 * as searchable as the pieces that went in, and a 3 MB set doesn't balloon.
 *
 * ignoreEncryption lets a file that carries only an owner password through
 * (common on "protected" exports that still open and print fine) rather than
 * throwing on it. A genuinely unreadable file throws, and the caller
 * (combineUploads) is written to fall back to the originals rather than lose
 * the lodgement over it.
 */
export async function mergePdfs(parts: Buffer[]): Promise<Buffer> {
  if (parts.length === 1) return parts[0];
  const out = await PDFDocument.create();
  for (const part of parts) {
    const src = await PDFDocument.load(part, { ignoreEncryption: true });
    const pages = await out.copyPages(src, src.getPageIndices());
    for (const p of pages) out.addPage(p);
  }
  return Buffer.from(await out.save());
}
