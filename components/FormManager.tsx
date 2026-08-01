"use client";
import { useRef, useState } from "react";
import { uploadDirect } from "@/lib/upload-client";

/** Staff tool: upload the current PDF for each council form clients download
 *  from the Resources page. */
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

  async function replace(key: string, file: File | undefined) {
    if (!file) return;
    if (!/\.pdf$/i.test(file.name)) { setMsg("PDFs only."); return; }
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
    setHave((prev) => new Set(prev).add(`${key}.pdf`));
  }

  async function remove(key: string) {
    setBusy(key); setMsg(null);
    const r = await fetch("/api/admin/forms", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, revert: true }),
    });
    setBusy(null);
    if (!r.ok) { const d = await r.json().catch(() => ({})); setMsg(d.error || "Failed."); return; }
    setHave((prev) => { const s = new Set(prev); s.delete(`${key}.pdf`); return s; });
  }

  return (
    <div className="card mb-8 p-4">
      <h2 className="font-display text-[12px] font-semibold uppercase tracking-[0.15em] text-ink/70">
        Council forms
      </h2>
      <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-ink/60">
        Host the current PDF of each council form on the Resources page. Upload a
        new version whenever the form changes; remove to fall back to the
        official-source link only.
      </p>
      <ul className="mt-3 divide-y divide-rule">
        {forms.map((f) => {
          const has = have.has(`${f.key}.pdf`);
          return (
            <li key={f.key} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <span className="font-mono text-[12px] text-seal">{f.code}</span>
                <span className="ml-2 text-[13px] font-medium">{f.title}</span>
                <span className={`ml-2 chip ${has ? "text-seal" : "text-ink/45"}`}>
                  {has ? "Hosted" : "Link only"}
                </span>
              </div>
              <div className="flex shrink-0 gap-2">
                <input
                  ref={(el) => { inputs.current[f.key] = el; }}
                  type="file" accept="application/pdf,.pdf" className="hidden"
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
