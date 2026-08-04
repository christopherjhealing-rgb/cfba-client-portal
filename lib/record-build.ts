import JSZip from "jszip";
import { jsPDF } from "jspdf";
import * as repo from "./repo";
import {
  transcript, asText, zipName, safeName,
  type Block, type Transcript,
} from "./records.mjs";

/**
 * Assembling a job's correspondence record.
 *
 * Lives apart from the routes because two things build it now — the Download
 * button in Admin → Records, and the automatic copy that goes to the office
 * when a client collects their package. If they built it separately they would
 * drift, and the whole value of an archive is that every copy of a given job's
 * record says the same thing.
 */
export interface BuiltRecord {
  transcript: Transcript;
  /** The zip: transcript PDF, plain-text copy, and every attachment. */
  zip: Buffer;
  /** The transcript alone, for when a zip is too big to email. */
  pdf: Buffer;
  filename: string;
  pdfName: string;
  /** Attachments named in the transcript that storage wouldn't give back. */
  missing: string[];
}

export async function buildRecord(ref: string): Promise<BuiltRecord | null> {
  const job = await repo.getJob(ref);
  if (!job) return null;

  const [messages, company] = await Promise.all([
    repo.listMessagesByRef(ref),
    job.companyId ? repo.companyById(job.companyId).catch(() => null) : null,
  ]);

  const t = transcript({
    job: {
      ref: job.ref,
      address: job.address,
      description: job.description,
      clientRef: job.clientRef,
      mondayStatus: job.mondayStatus,
      receivedAt: job.receivedAt,
      issuedAt: job.issuedAt,
    },
    messages,
    companyName: company?.name || "",
    exportedAt: new Date().toISOString(),
  });

  const pdf = Buffer.from(renderPdf(t.blocks));
  const base = `${safeName(ref, 20)} correspondence`;

  const zip = new JSZip();
  zip.file(`${base}.pdf`, pdf, { binary: true });
  zip.file(`${base}.txt`, asText(t));

  const missing: string[] = [];
  for (const f of t.files) {
    try {
      const bytes = await repo.readFile(f.storagePath as string);
      if (!bytes.length) throw new Error("stored file is empty");
      zip.file(f.path, bytes);
    } catch (e) {
      missing.push(`${f.path} — ${(e as Error).message}`);
    }
  }
  if (missing.length) {
    zip.file(
      "attachments/MISSING - read me.txt",
      "These documents are named in the transcript but could not be read back " +
      "from storage when this record was exported:\n\n" +
      missing.map((m) => `  ${m}`).join("\n") +
      "\n\nThey may still be on the monday.com card for this job.\n"
    );
  }

  return {
    transcript: t,
    zip: await zip.generateAsync({ type: "nodebuffer" }),
    pdf,
    filename: zipName(job),
    pdfName: `${base}.pdf`,
    missing,
  };
}

/* ------------------------------------------------------------------------ */
/* The transcript as a PDF. Plain by design — this is a correspondence log
   that has to be legible in seven years, not a designed document. Helvetica
   and the page number are the whole of the styling. */

const PAGE_W = 210, PAGE_H = 297, M = 20, BOTTOM = PAGE_H - 18;

function renderPdf(blocks: Block[]): ArrayBuffer {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = PAGE_W - M * 2;
  let y = M;

  const space = (n: number) => {
    if (y + n > BOTTOM) { doc.addPage(); y = M; } else { y += n; }
  };
  const write = (text: string, size: number, style: "normal" | "bold", indent = 0) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, W - indent) as string[];
    const lh = size * 0.42 + 0.9;
    for (const line of lines) {
      // Break BEFORE the line, never after — a heading orphaned at the foot of
      // a page with its text overleaf is exactly what an archive shouldn't do.
      if (y + lh > BOTTOM) { doc.addPage(); y = M; }
      doc.text(line, M + indent, y);
      y += lh;
    }
  };

  for (const b of blocks) {
    switch (b.type) {
      case "title":
        write(b.text, 16, "bold"); space(3);
        doc.setDrawColor(150); doc.line(M, y, PAGE_W - M, y); space(5);
        break;
      case "field":      write(b.text, 10, "normal"); space(0.6); break;
      case "heading":    space(5); write(b.text, 12, "bold"); space(2.5); break;
      case "note":       write(b.text, 9,  "normal", 3); space(1.6); break;
      case "from":       space(3); write(b.text, 10.5, "bold"); space(1.4); break;
      case "body":       write(b.text, 10, "normal", 3); space(2); break;
      case "attachment": write(b.text, 9.5, "bold", 6); space(1.4); break;
    }
  }

  // Page numbers last, when the count is known.
  const n = doc.getNumberOfPages();
  for (let p = 1; p <= n; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(110);
    doc.text(`Page ${p} of ${n}`, PAGE_W / 2, PAGE_H - 10, { align: "center" });
    doc.setTextColor(0);
  }
  return doc.output("arraybuffer");
}
