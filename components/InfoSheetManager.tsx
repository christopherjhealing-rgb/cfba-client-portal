"use client";
import { useRef, useState } from "react";
import { uploadDirect } from "@/lib/upload-client";

/** Staff tool for superseding a published guidance note with a new PDF, or
 *  reverting to the original that ships with the app. */
export function InfoSheetManager({
  sheets,
  overridden,
}: {
  sheets: { file: string; title: string }[];
  overridden: string[];
}) {
  const [updated, setUpdated] = useState(() => new Set(overridden));
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  async function replace(key: string, file: File | undefined) {
    if (!file) return;
    if (!/\.pdf$/i.test(file.name)) { setMsg("PDFs only."); return; }
    setBusy(key); setMsg(null);

    const up = await uploadDirect("infosheet", [file]);
    if ("error" in up) { setBusy(null); setMsg(up.error); return; }
    if (up.mode === "inline") {
      setBusy(null); setMsg("Not available in demo mode."); return;
    }

    const r = await fetch("/api/admin/info-sheets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, draftId: up.draftId, name: up.names[0] }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok) { setMsg(d.error || "Failed."); return; }
    setUpdated((prev) => new Set(prev).add(key));
    setMsg(null);
  }

  async function revert(key: string) {
    setBusy(key); setMsg(null);
    const r = await fetch("/api/admin/info-sheets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, revert: true }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok) { setMsg(d.error || "Failed."); return; }
    setUpdated((prev) => {
      const s = new Set(prev);
      s.delete(key);
      return s;
    });
  }

  return (
    <div className="card mb-8 p-4">
      <h2 className="font-display text-[12px] font-semibold uppercase tracking-[0.15em] text-ink/70">
        Info Sheets
      </h2>
      <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-ink/60">
        Upload a new PDF to supersede a published note — clients get the new
        version immediately, everywhere it&apos;s linked. Revert restores the
        original at any time. No redeploy needed.
      </p>
      <ul className="mt-3 divide-y divide-rule">
        {sheets.map((s) => {
          const isUpdated = updated.has(s.file);
          return (
            <li key={s.file} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <span className="text-[13px] font-medium">{s.title}</span>
                <span className={`ml-2 chip ${isUpdated ? "text-seal" : "text-ink/45"}`}>
                  {isUpdated ? "Updated" : "Original"}
                </span>
              </div>
              <div className="flex shrink-0 gap-2">
                <input
                  ref={(el) => { inputs.current[s.file] = el; }}
                  type="file" accept="application/pdf,.pdf" className="hidden"
                  onChange={(e) => replace(s.file, e.target.files?.[0])}
                />
                <button className="btn-ghost" disabled={busy === s.file}
                  onClick={() => inputs.current[s.file]?.click()}>
                  {busy === s.file ? "…" : "Upload New Version"}
                </button>
                {isUpdated && (
                  <button className="btn-ghost" disabled={busy === s.file}
                    onClick={() => revert(s.file)}>
                    Revert
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
