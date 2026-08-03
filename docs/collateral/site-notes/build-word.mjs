// Turn each guidance note's HTML source into a clean, editable Word document.
//
// Not a facsimile of the printed sheet — the point is that Chris can open it,
// change the wording, and hand it back. So it carries the CONTENT in real Word
// structures (Heading 1/2/3, bullet lists, numbered steps, tables), which is
// also what makes the return trip readable: mammoth/pandoc give back something
// that folds straight into the HTML masters.
//
// The notes are NOT uniform. Some run to two or three printed pages; lists sit
// inside .cols wrappers; steps are <li> with a number span and a nested h3+p.
// So this walks the tree recursively rather than iterating direct children —
// the first version took only the first .content block and dropped two thirds
// of the lodging checklist.
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import path from "node:path";
import { parse } from "node-html-parser";
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, LevelFormat,
  Header, Footer, PageNumber,
} from "docx";

const SRC = "/home/user/cfba-client-portal/docs/collateral/site-notes";
const OUT = path.join(SRC, "word");
mkdirSync(OUT, { recursive: true });

const GREEN = "1E5B3C", BRASS = "8A6D1E", INK = "1B2420", MUTED = "5B6660";
const BULLET = "cfba-bullet";

const ENT = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', mdash: "—", ndash: "–",
  rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”",
  hellip: "…", deg: "°", sup2: "²", times: "×", frac12: "½", middot: "·",
};
const decode = (s) => s.replace(/&(\w+);/g, (m, k) => (k in ENT ? ENT[k] : m))
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));

/** Inline runs, keeping bold/italic. `.nb` (BAL-40 etc.) reads as bold. */
function runs(node, base = {}) {
  const out = [];
  const walk = (n, fmt) => {
    if (n.nodeType === 3) {
      const t = decode(n.rawText).replace(/\s+/g, " ");
      if (t.trim() || (out.length && t === " ")) out.push(new TextRun({ text: t, ...base, ...fmt }));
      return;
    }
    if (n.nodeType !== 1) return;
    const tag = (n.rawTagName || "").toLowerCase();
    const cls = n.getAttribute("class") || "";
    if (cls.includes("step-n")) return; // the number is rendered by the list itself
    const next = { ...fmt };
    if (tag === "strong" || tag === "b" || cls.includes("nb")) next.bold = true;
    if (tag === "em" || tag === "i") next.italics = true;
    for (const c of n.childNodes) walk(c, next);
  };
  for (const c of node.childNodes) walk(c, {});
  // Trim the leading/trailing space source line-wrapping leaves behind.
  return out.length ? out : [new TextRun({ text: "", ...base })];
}

const txt = (node) => decode(node.text || "").replace(/\s+/g, " ").trim();

const para = (children, opts = {}) => new Paragraph({ spacing: { after: 140 }, ...opts, children });

function heading(level, t) {
  const size = level === 2 ? 24 : 22;
  return new Paragraph({
    heading: level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
    spacing: { before: level === 2 ? 320 : 220, after: 110 },
    children: [new TextRun({ text: t, bold: true, size, color: level === 2 ? GREEN : INK })],
  });
}

function calloutPara(el) {
  const warn = (el.getAttribute("class") || "").includes("warn");
  return new Paragraph({
    spacing: { before: 200, after: 200 },
    shading: { type: ShadingType.CLEAR, fill: warn ? "FBF4E6" : "F4F8F4" },
    border: {
      left: { style: BorderStyle.SINGLE, size: 18, color: warn ? BRASS : GREEN, space: 10 },
      top: { style: BorderStyle.NONE, size: 0, color: "auto" },
      bottom: { style: BorderStyle.NONE, size: 0, color: "auto" },
      right: { style: BorderStyle.NONE, size: 0, color: "auto" },
    },
    indent: { left: 160, right: 160 },
    children: runs(el, { size: 21, color: INK }),
  });
}

function tableBlock(el) {
  const rows = el.querySelectorAll("tr");
  if (!rows.length) return [];
  const cols = Math.max(...rows.map((r) => r.querySelectorAll("td,th").length));
  const TOTAL = 9360; // 6.5" of content width, in DXA
  const widths = cols === 2 ? [3100, TOTAL - 3100]
    : Array.from({ length: cols }, () => Math.floor(TOTAL / cols));
  return [
    new Table({
      columnWidths: widths,
      width: { size: TOTAL, type: WidthType.DXA },
      rows: rows.map((r) => {
        const cells = r.querySelectorAll("td,th");
        return new TableRow({
          children: cells.map((c, ci) => new TableCell({
            width: { size: widths[ci] ?? widths[widths.length - 1], type: WidthType.DXA },
            shading: (c.rawTagName || "").toLowerCase() === "th"
              ? { type: ShadingType.CLEAR, fill: "F4F8F4" } : undefined,
            margins: { top: 90, bottom: 90, left: 120, right: 120 },
            children: [new Paragraph({ children: runs(c, { size: 20, color: INK }) })],
          })),
        });
      }),
    }),
    new Paragraph({ spacing: { after: 120 }, children: [new TextRun("")] }),
  ];
}

/** A numbered step: <li><span class="step-n">1</span><div><h3>..</h3><p>..</p></div></li> */
function stepBlock(li, n) {
  const out = [];
  const h3 = li.querySelector("h3");
  out.push(new Paragraph({
    spacing: { before: 200, after: 90 },
    indent: { left: 360, hanging: 360 },
    children: [
      new TextRun({ text: `${n}.  `, bold: true, size: 22, color: GREEN }),
      new TextRun({ text: h3 ? txt(h3) : "", bold: true, size: 22, color: INK }),
    ],
  }));
  for (const p of li.querySelectorAll("p")) {
    out.push(para(runs(p, { size: 21, color: INK }), { indent: { left: 360 }, spacing: { after: 110 } }));
  }
  if (!h3 && !li.querySelectorAll("p").length) {
    out.push(para(runs(li, { size: 21, color: INK }), { indent: { left: 360 } }));
  }
  return out;
}

const SKIP_CLASS = ["band", "foot", "scrim", "goldrule", "band-logo", "bg", "running", "step-n"];

/** Walk a subtree, emitting Word blocks. Recurses through wrapper divs. */
function walkBlocks(node, out) {
  for (const el of node.childNodes) {
    if (el.nodeType !== 1) continue;
    const tag = (el.rawTagName || "").toLowerCase();
    const cls = el.getAttribute("class") || "";
    if (SKIP_CLASS.some((c) => cls.split(/\s+/).includes(c))) continue;

    if (cls.includes("sec")) { out.push(heading(2, txt(el))); continue; }
    if (cls.includes("subhead")) { out.push(heading(3, txt(el))); continue; }
    if (tag === "h2") { out.push(heading(2, txt(el))); continue; }
    if (tag === "h3") { out.push(heading(3, txt(el))); continue; }
    if (cls.includes("callout")) { out.push(calloutPara(el)); continue; }

    if (cls.includes("figure")) {
      out.push(para([new TextRun({
        text: `[ diagram: ${txt(el) || "figure from the printed sheet"} ]`,
        italics: true, size: 19, color: MUTED,
      })], { spacing: { before: 120, after: 160 } }));
      continue;
    }

    if (tag === "table") { out.push(...tableBlock(el)); continue; }

    if (tag === "ul" && cls.includes("steps")) {
      let n = 1;
      for (const li of el.querySelectorAll("li")) out.push(...stepBlock(li, n++));
      continue;
    }

    if (tag === "ul") {
      for (const li of el.querySelectorAll("li")) {
        out.push(new Paragraph({
          numbering: { reference: BULLET, level: 0 },
          spacing: { after: 80 },
          children: runs(li, { size: 21, color: INK }),
        }));
      }
      continue;
    }

    if (tag === "ol") {
      let n = 1;
      for (const li of el.querySelectorAll("li")) {
        out.push(para([
          new TextRun({ text: `${n++}.  `, bold: true, size: 21, color: GREEN }),
          ...runs(li, { size: 21, color: INK }),
        ], { indent: { left: 360, hanging: 260 }, spacing: { after: 80 } }));
      }
      continue;
    }

    if (tag === "p") {
      if (txt(el)) out.push(para(runs(el, { size: 21, color: INK })));
      continue;
    }

    // A wrapper (.cols, .lists, a bare div): go in. This is what the first
    // version missed — the lodging checklist's nine lists all live in here.
    if (tag === "div" || tag === "section") { walkBlocks(el, out); continue; }
  }
}

function noteDoc(file) {
  const root = parse(readFileSync(path.join(SRC, file), "utf8"));
  const band = root.querySelector(".band");
  const eyebrow = txt(root.querySelector(".eyebrow") || { text: "" });
  const title = txt(root.querySelector("h1") || { text: "" });
  const subEl = band?.querySelector(".sub");

  const children = [
    new Paragraph({
      spacing: { after: 60 },
      children: [new TextRun({
        text: eyebrow.toUpperCase(), bold: true, size: 16, color: BRASS, characterSpacing: 40,
      })],
    }),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 120 },
      children: [new TextRun({ text: title, bold: true, size: 40, color: GREEN })],
    }),
  ];
  if (subEl) {
    children.push(new Paragraph({
      spacing: { after: 260 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "D8E0D8", space: 8 } },
      children: runs(subEl, { size: 22, color: MUTED, italics: true }),
    }));
  }

  // EVERY .content block — several notes run to two or three printed pages.
  const contents = root.querySelectorAll(".content");
  if (!contents.length) throw new Error(`${file}: no .content block`);
  for (const c of contents) walkBlocks(c, children);

  return new Document({
    creator: "CF Building Approvals",
    title: `${eyebrow} — ${title}`,
    description: "Guidance note source, for editing. Hand it back and it goes into the portal PDF.",
    numbering: {
      config: [{
        reference: BULLET,
        levels: [{
          level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 360, hanging: 260 } } },
        }],
      }],
    },
    styles: { default: { document: { run: { font: "Calibri", size: 21, color: INK } } } },
    sections: [{
      properties: { page: { margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 } } },
      headers: {
        default: new Header({
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({
              text: "CF Building Approvals — guidance note, for editing", size: 16, color: MUTED,
            })],
          })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ children: ["Page ", PageNumber.CURRENT], size: 16, color: MUTED })],
          })],
        }),
      },
      children,
    }],
  });
}

const files = readdirSync(SRC).filter((f) => f.endsWith(".html")).sort();
for (const f of files) {
  const buf = await Packer.toBuffer(noteDoc(f));
  writeFileSync(path.join(OUT, f.replace(/\.html$/, ".docx")), buf);
}
console.log(`${files.length} Word documents written to ${OUT}`);
