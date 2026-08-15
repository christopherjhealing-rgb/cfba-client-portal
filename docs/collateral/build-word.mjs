// Turn every collateral sheet into a clean, editable Word document — the same
// deal as site-notes/build-word.mjs (its architecture, extended): not a
// facsimile of the printed page, but the CONTENT in real Word structures so
// the office can edit wording on a phone and hand it back. The printed look
// stays the HTML master's job.
//
// Extras over the notes converter: h4 (timeline/decision boxes), the trial
// sheet's mission cards (Tester chip folded into the heading), the flyer and
// services card grids, email templates, and a markdown mode for the go-live
// runbook (headings, checklists, code fences, tables).
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import path from "node:path";
import { parse } from "node-html-parser";
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, LevelFormat,
  Header, Footer, PageNumber,
} from "docx";

const SRC = "/home/user/cfba-client-portal/docs/collateral";
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

function runs(node, base = {}) {
  const out = [];
  const walk = (n, fmt) => {
    if (n.nodeType === 3) {
      const t = decode(n.rawText).replace(/\s+/g, " ");
      if (t.trim() || (out.length && t === " ")) out.push(new TextRun({ text: t, ...base, ...fmt }));
      return;
    }
    if (n.nodeType !== 1) return;
    const cls = n.getAttribute("class") || "";
    if (/\b(step-n|who|num|qr|hn|tl-dot|fnum)\b/.test(cls)) return;
    const tag = (n.rawTagName || "").toLowerCase();
    if (tag === "img") return;
    const next = { ...fmt };
    if (tag === "strong" || tag === "b" || /\bnb\b/.test(cls)) next.bold = true;
    if (tag === "em" || tag === "i") next.italics = true;
    if (/\bmono\b/.test(cls)) { next.font = "Consolas"; }
    for (const c of n.childNodes) walk(c, next);
  };
  for (const c of node.childNodes) walk(c, {});
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
  const TOTAL = 9360;
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

const SKIP_CLASS = [
  "band", "foot", "foot-light", "scrim", "goldrule", "band-logo", "bg",
  "running", "step-n", "cta", "hero", "meta", "hsep", "farrow", "fjump", "dsep",
];

function walkBlocks(node, out) {
  for (const el of node.childNodes) {
    if (el.nodeType !== 1) continue;
    const tag = (el.rawTagName || "").toLowerCase();
    const cls = el.getAttribute("class") || "";
    const clsList = cls.split(/\s+/);
    if (SKIP_CLASS.some((c) => clsList.includes(c))) continue;

    if (clsList.includes("sec")) { out.push(heading(2, txt(el))); continue; }
    if (clsList.includes("subhead")) { out.push(heading(3, txt(el))); continue; }
    if (tag === "h2") { out.push(heading(2, txt(el))); continue; }
    if (tag === "h3" || tag === "h4") {
      // Mission cards carry a Tester chip inside the h3 — fold it in front.
      const who = el.querySelector(".who");
      const label = who ? `${txt(who)} — ` : "";
      if (who) who.remove();
      out.push(heading(3, label + txt(el)));
      continue;
    }
    if (clsList.includes("callout")) { out.push(calloutPara(el)); continue; }

    if (clsList.includes("figure")) {
      out.push(para([new TextRun({
        text: `[ diagram: ${txt(el).slice(0, 120) || "figure from the printed sheet"} ]`,
        italics: true, size: 19, color: MUTED,
      })], { spacing: { before: 120, after: 160 } }));
      continue;
    }

    if (tag === "img" || tag === "svg") continue;
    if (tag === "table") { out.push(...tableBlock(el)); continue; }

    if (tag === "ul" && clsList.includes("steps")) {
      let n = 1;
      for (const li of el.querySelectorAll("li")) out.push(...stepBlock(li, n++));
      continue;
    }
    if ((tag === "ul" || tag === "ol") && clsList.includes("key")) {
      let n = 1;
      for (const li of el.querySelectorAll("li")) {
        out.push(para([
          new TextRun({ text: `${n++}.  `, bold: true, size: 20, color: GREEN }),
          ...runs(li, { size: 20, color: INK }),
        ], { indent: { left: 360, hanging: 260 }, spacing: { after: 70 } }));
      }
      continue;
    }
    if (tag === "ul") {
      for (const li of el.querySelectorAll(":scope > li, li")) {
        if (li.parentNode !== el) continue;
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
        if (li.parentNode !== el) continue;
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
    if (tag === "span") {
      if (txt(el)) out.push(para(runs(el, { size: 21, color: INK })));
      continue;
    }

    if (tag === "div" || tag === "section") {
      // A div can carry BARE inline content (the admin guide's decision
      // boxes, the job-flow diagram labels) — emit that as a paragraph
      // before recursing into its block children, or it silently vanishes.
      const BLOCK = new Set(["div", "section", "ul", "ol", "table", "p", "h2", "h3", "h4", "img", "svg"]);
      const inline = el.childNodes.filter((c) =>
        c.nodeType === 3 ? decode(c.rawText).trim()
          : c.nodeType === 1 && !BLOCK.has((c.rawTagName || "").toLowerCase())
            && !/\b(step-n|who|num|qr|hn|tl-dot|fnum|pill-role)\b/.test(c.getAttribute("class") || ""));
      if (inline.length) {
        const fake = { childNodes: inline };
        const r = runs(fake, { size: 21, color: INK });
        if (r.some((x) => (x.options?.text || "").trim() || true)) {
          const probe = inline.map((c) => c.nodeType === 3 ? c.rawText : c.text).join(" ");
          if (decode(probe).replace(/\s+/g, " ").trim()) out.push(para(r));
        }
      }
      walkBlocks(el, out); continue;
    }
  }
}

function sheetDoc(file) {
  const root = parse(readFileSync(path.join(SRC, file), "utf8"));
  const eyebrow = txt(root.querySelector(".eyebrow") || { text: "" });
  const title = txt(root.querySelector("h1") || root.querySelector("title") || { text: "" });
  const subEl = root.querySelector(".band .sub, .hero .sub");

  const children = [];
  if (eyebrow) {
    children.push(new Paragraph({
      spacing: { after: 60 },
      children: [new TextRun({ text: eyebrow.toUpperCase(), bold: true, size: 16, color: BRASS, characterSpacing: 40 })],
    }));
  }
  children.push(new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { after: 120 },
    children: [new TextRun({ text: title, bold: true, size: 40, color: GREEN })],
  }));
  if (subEl) {
    children.push(new Paragraph({
      spacing: { after: 260 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "D8E0D8", space: 8 } },
      children: runs(subEl, { size: 22, color: MUTED, italics: true }),
    }));
  }

  const contents = root.querySelectorAll(".content");
  if (contents.length) for (const c of contents) walkBlocks(c, children);
  else walkBlocks(root.querySelector("body") || root, children);

  return buildDoc(title, children,
    "Collateral sheet source, for editing. Hand it back and it goes into the printed PDF.");
}

function buildDoc(title, children, description) {
  return new Document({
    creator: "CF Building Approvals",
    title, description,
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
            children: [new TextRun({ text: "CF Building Approvals — for editing; layout comes from the master", size: 16, color: MUTED })],
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

// ---------------------------------------------------------------------------
// The go-live runbook rides along: markdown → the same editable Word shape.
// ---------------------------------------------------------------------------
function mdRuns(line, base = {}) {
  const out = [];
  let rest = line;
  const rx = /(\*\*[^*]+\*\*|`[^`]+`)/;
  while (rest.length) {
    const m = rest.match(rx);
    if (!m) { out.push(new TextRun({ text: rest, ...base })); break; }
    if (m.index > 0) out.push(new TextRun({ text: rest.slice(0, m.index), ...base }));
    const tok = m[0];
    if (tok.startsWith("**")) out.push(new TextRun({ text: tok.slice(2, -2), bold: true, ...base }));
    else out.push(new TextRun({ text: tok.slice(1, -1), font: "Consolas", ...base }));
    rest = rest.slice(m.index + tok.length);
  }
  return out.length ? out : [new TextRun({ text: "", ...base })];
}

function runbookDoc(mdPath) {
  const lines = readFileSync(mdPath, "utf8").split("\n");
  const children = [];
  let inCode = false;
  for (const raw of lines) {
    const line = raw.replace(/\r$/, "");
    if (line.trim().startsWith("```")) { inCode = !inCode; continue; }
    if (inCode) {
      children.push(new Paragraph({
        shading: { type: ShadingType.CLEAR, fill: "F2F4F2" },
        spacing: { after: 20 },
        children: [new TextRun({ text: line || " ", font: "Consolas", size: 18, color: INK })],
      }));
      continue;
    }
    if (!line.trim() || /^-{3,}$/.test(line.trim())) continue;
    let m;
    if ((m = line.match(/^#\s+(.*)/))) {
      children.push(new Paragraph({
        heading: HeadingLevel.HEADING_1, spacing: { after: 140 },
        children: [new TextRun({ text: m[1], bold: true, size: 36, color: GREEN })],
      }));
    } else if ((m = line.match(/^##\s+(.*)/))) {
      children.push(heading(2, m[1]));
    } else if ((m = line.match(/^###\s+(.*)/))) {
      children.push(heading(3, m[1]));
    } else if ((m = line.match(/^\s*-\s+\[( |x)\]\s+(.*)/i))) {
      children.push(new Paragraph({
        spacing: { after: 70 }, indent: { left: 360, hanging: 300 },
        children: [
          new TextRun({ text: m[1].trim() ? "☑  " : "☐  ", size: 22, color: GREEN }),
          ...mdRuns(m[2], { size: 21, color: INK }),
        ],
      }));
    } else if ((m = line.match(/^\s*[-*]\s+(.*)/))) {
      children.push(new Paragraph({
        numbering: { reference: BULLET, level: 0 }, spacing: { after: 70 },
        children: mdRuns(m[1], { size: 21, color: INK }),
      }));
    } else if ((m = line.match(/^\s*(\d+)\.\s+(.*)/))) {
      children.push(para([
        new TextRun({ text: `${m[1]}.  `, bold: true, size: 21, color: GREEN }),
        ...mdRuns(m[2], { size: 21, color: INK }),
      ], { indent: { left: 360, hanging: 300 }, spacing: { after: 70 } }));
    } else {
      children.push(para(mdRuns(line, { size: 21, color: INK }), { spacing: { after: 110 } }));
    }
  }
  return buildDoc("Go-Live Runbook", children,
    "The go-live runbook, for editing on the go. The repo's GO-LIVE-RUNBOOK.md is the master.");
}

// ---------------------------------------------------------------------------
const files = readdirSync(SRC).filter((f) => f.endsWith(".html")).sort();
for (const f of files) {
  const root = parse(readFileSync(path.join(SRC, f), "utf8"));
  const title = txt(root.querySelector("h1") || root.querySelector("title") || { text: f });
  const num = (f.match(/^(\d+)/) || [])[1] || "";
  const safe = title.replace(/[\\/:*?"<>|—]+/g, "-").replace(/\s*-\s*/g, " - ").replace(/\s+/g, " ").trim().slice(0, 80);
  const name = `${num ? num + " - " : ""}${safe || f.replace(/\.html$/, "")}.docx`;
  const buf = await Packer.toBuffer(sheetDoc(f));
  writeFileSync(path.join(OUT, name), buf);
  console.log("wrote", name);
}
const rb = await Packer.toBuffer(runbookDoc("/home/user/cfba-client-portal/docs/GO-LIVE-RUNBOOK.md"));
writeFileSync(path.join(OUT, "00 - Go-Live Runbook.docx"), rb);
console.log("wrote 00 - Go-Live Runbook.docx");
