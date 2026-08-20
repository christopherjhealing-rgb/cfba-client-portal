// Export every document's CONTENT as structured plain text — the editable
// representation behind the CFBA Doc Editor artifact. Same contract as the
// Word exports: wording only; layout stays with the HTML masters.
//
//   ## Section      ### Subheading      - bullet      1. step
//   > callout       | table | cells |   [diagram: …]
//
// Emits one JSON file: [{ id, group, name, path, text }]. The apply side
// (Claude, on receiving edits) folds changed text back into each master.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { parse } from "node-html-parser";

const ROOT = "/home/user/cfba-client-portal";
const COLL = path.join(ROOT, "docs/collateral");
const NOTES = path.join(COLL, "site-notes");

const ENT = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', mdash: "—", ndash: "–",
  rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”",
  hellip: "…", deg: "°", sup2: "²", times: "×", frac12: "½", middot: "·",
};
const decode = (s) => s.replace(/&(\w+);/g, (m, k) => (k in ENT ? ENT[k] : m))
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
const txt = (n) => decode(n.text || "").replace(/\s+/g, " ").trim();

const SKIP = new Set([
  "band", "foot", "foot-light", "scrim", "goldrule", "band-logo", "bg",
  "running", "step-n", "cta", "hero", "meta", "hsep", "farrow", "fjump", "dsep",
  "qr", "num", "hn", "tl-dot", "fnum",
]);
const BLOCK = new Set(["div", "section", "ul", "ol", "table", "p", "h2", "h3", "h4", "img", "svg"]);

function walk(node, out) {
  for (const el of node.childNodes) {
    if (el.nodeType !== 1) continue;
    const tag = (el.rawTagName || "").toLowerCase();
    const cls = (el.getAttribute("class") || "").split(/\s+/).filter(Boolean);
    if (cls.some((c) => SKIP.has(c))) continue;

    if (cls.includes("sec") || tag === "h2") { out.push("", `## ${txt(el)}`, ""); continue; }
    if (tag === "h3" || tag === "h4" || cls.includes("subhead")) {
      const who = el.querySelector?.(".who");
      const label = who ? `${txt(who)} — ` : "";
      if (who) who.remove();
      out.push("", `### ${label}${txt(el)}`, ""); continue;
    }
    if (cls.includes("callout")) { out.push("", `> ${txt(el)}`, ""); continue; }
    if (cls.includes("figure")) { out.push("", `[diagram: ${txt(el).slice(0, 110)}]`, ""); continue; }
    if (tag === "img" || tag === "svg") continue;

    if (tag === "table") {
      out.push("");
      for (const r of el.querySelectorAll("tr")) {
        const cells = r.querySelectorAll("td,th").map((c) => txt(c));
        out.push(`| ${cells.join(" | ")} |`);
      }
      out.push(""); continue;
    }
    if (tag === "ul" && cls.includes("steps")) {
      let n = 1;
      for (const li of el.querySelectorAll("li")) {
        const h3 = li.querySelector("h3");
        const ps = li.querySelectorAll("p").map((p) => txt(p)).filter(Boolean);
        out.push(`${n}. ${h3 ? txt(h3) : txt(li)}`);
        for (const p of ps) out.push(`   ${p}`);
        n++;
      }
      out.push(""); continue;
    }
    if (tag === "ul") {
      for (const li of el.childNodes) {
        if (li.nodeType === 1 && (li.rawTagName || "").toLowerCase() === "li") out.push(`- ${txt(li)}`);
      }
      out.push(""); continue;
    }
    if (tag === "ol") {
      let n = 1;
      for (const li of el.childNodes) {
        if (li.nodeType === 1 && (li.rawTagName || "").toLowerCase() === "li") out.push(`${n++}. ${txt(li)}`);
      }
      out.push(""); continue;
    }
    if (tag === "p" || tag === "span") { const t = txt(el); if (t) out.push(t, ""); continue; }

    if (tag === "div" || tag === "section") {
      const inline = el.childNodes.filter((c) =>
        c.nodeType === 3 ? decode(c.rawText).trim()
          : c.nodeType === 1 && !BLOCK.has((c.rawTagName || "").toLowerCase())
            && !(c.getAttribute("class") || "").split(/\s+/).some((x) => SKIP.has(x)));
      if (inline.length) {
        const t = inline.map((c) => (c.nodeType === 3 ? decode(c.rawText) : txt(c))).join(" ")
          .replace(/\s+/g, " ").trim();
        if (t) out.push(t, "");
      }
      walk(el, out); continue;
    }
  }
}

function docText(file, dir) {
  const root = parse(readFileSync(path.join(dir, file), "utf8"));
  const eyebrow = txt(root.querySelector(".eyebrow") || { text: "" });
  const title = txt(root.querySelector("h1") || root.querySelector("title") || { text: file });
  const sub = root.querySelector(".band .sub, .hero .sub");
  const out = [`# ${title}`];
  if (eyebrow) out.push(`(${eyebrow})`);
  if (sub) out.push("", `*${txt(sub)}*`);
  out.push("");
  const contents = root.querySelectorAll(".content");
  if (contents.length) for (const c of contents) walk(c, out);
  else walk(root.querySelector("body") || root, out);
  return { title, text: out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n" };
}

const GROUPS = {
  note: "Info sheets", client: "Client-facing", internal: "Internal", email: "Emails & letters",
};
const CLASSIFY = {
  "01": "client", "02": "client", "03": "email", "04": "client", "05": "client",
  "06": "email", "07": "client", "08": "client", "09": "internal", "10": "internal",
  "11": "internal", "12": "client", "13": "client", "14": "client", "15": "client",
  "16": "client", "17": "email", "18": "email", "19": "internal", "20": "internal",
  "21": "internal", "22": "client", "23": "client", "24": "client", "25": "internal",
  "26": "internal",
};

const docs = [];
for (const f of readdirSync(NOTES).filter((x) => x.endsWith(".html")).sort()) {
  const { title, text } = docText(f, NOTES);
  docs.push({ id: `note:${f}`, group: GROUPS.note, name: title, path: `docs/collateral/site-notes/${f}`, text });
}
for (const f of readdirSync(COLL).filter((x) => x.endsWith(".html")).sort()) {
  const num = (f.match(/^(\d+)/) || [])[1];
  const { title, text } = docText(f, COLL);
  docs.push({
    id: `coll:${f}`, group: GROUPS[CLASSIFY[num] || "client"],
    name: title, path: `docs/collateral/${f}`, text,
  });
}
docs.push({
  id: "md:runbook", group: GROUPS.internal, name: "Go-Live Runbook",
  path: "docs/GO-LIVE-RUNBOOK.md",
  text: readFileSync(path.join(ROOT, "docs/GO-LIVE-RUNBOOK.md"), "utf8"),
});

const outPath = process.argv[2] || path.join(COLL, "doc-text.json");
writeFileSync(outPath, JSON.stringify(docs, null, 1));
console.log(docs.length, "documents ->", outPath,
  Math.round(JSON.stringify(docs).length / 1024) + "KB");
