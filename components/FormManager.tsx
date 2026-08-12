"use client";
import { useRef, useState } from "react";
import { uploadDirect } from "@/lib/upload-client";
import { FORM_LABEL, formExtOf, formFileNames, hostedFormFile } from "@/lib/resources";

/** Staff tool: upload the current file for each council form clients download
 *  from the Resources page. PDF or Word — councils publish both. */
export function FormManager({
  forms,
  uploaded,
}: {
  forms: { key: string; code: string; title: string }[];
  uploaded: string[];
}) {
  const [have, setHave] = useState(() => new Set(uploaded));
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  /** Only ever one file per form on screen, the same way there's only ever one
   *  in storage — otherwise replacing a PDF with a Word version would leave
   *  both showing until a reload. */
  const settle = (key: string, keep: string | null) =>
    setHave((prev) => {
      const s = new Set(prev);
      for (const f of formFileNames(key)) s.delete(f);
      if (keep) s.add(keep);
      return s;
    });

  async function replace(key: string, file: File | undefined) {
    if (!file) return;
    if (!formExtOf(file.name)) { setMsg("PDF or Word (.pdf, .docx, .doc)."); return; }
    setBusy(key); setMsg(null);
    const up = await uploadDirect("form", [file]);
    if ("error" in up) { setBusy(null); setMsg(up.error); return; }
    if (up.mode === "inline") { setBusy(null); setMsg("Not available in demo mode."); return; }
    const r = await fetch("/api/admin/forms", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, draftId: up.draftId, name: up.names[0] }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok) { setMsg(d.error || "Failed."); return; }
    settle(key, d.file || null);
  }

  async function remove(key: string) {
    setBusy(key); setMsg(null);
    const r = await fetch("/api/admin/forms", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, revert: true }),
    });
    setBusy(null);
    if (!r.ok) { const d = await r.json().catch(() => ({})); setMsg(d.error || "Failed."); return; }
    settle(key, null);
  }

  return (
    <div className="card mb-8 p-4">
      <h2 className="font-display text-[12px] font-semibold uppercase tracking-[0.15em] text-ink/70">
        Council Forms
      </h2>
      <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-ink/60">
        Host the current version of each council form on the Resources page.
        PDF or Word — whichever the council publishes. Upload a new version
        whenever the form changes; remove to fall back to the official-source
        link only.
      </p>
      <ul className="mt-3 divide-y divide-rule">
        {forms.map((f) => {
          const hosted = hostedFormFile(f.key, have);
          const has = !!hosted;
          return (
            <li key={f.key} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <span className="font-mono text-[12px] text-seal">{f.code}</span>
                <span className="ml-2 text-[13px] font-medium">{f.title}</span>
                <span className={`ml-2 chip ${has ? "text-seal" : "text-ink/60"}`}>
                  {hosted ? `Hosted · ${FORM_LABEL[hosted.ext]}` : "Link Only"}
                </span>
              </div>
              <div className="flex shrink-0 gap-2">
                <input
                  ref={(el) => { inputs.current[f.key] = el; }}
                  type="file"
                  accept="application/pdf,.pdf,.docx,.doc,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="hidden"
                  onChange={(e) => replace(f.key, e.target.files?.[0])}
                />
                <button className="btn-ghost" disabled={busy === f.key}
                  onClick={() => inputs.current[f.key]?.click()}>
                  {busy === f.key ? "…" : has ? "Replace" : "Upload"}
                </button>
                {has && (
                  <button className="btn-ghost" disabled={busy === f.key} onClick={() => remove(f.key)}>
                    Remove
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {msg && <p className="mt-2 text-[13px] text-flag">{msg}</p>}
    </div>
  );
}
