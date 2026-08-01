"use client";
import { useState } from "react";

/** Staff control for the (dormant) engineering checker: enable client access
 *  and set the checker's URL. Off by default. */
export function EngineeringControl({
  initial,
}: {
  initial: { enabled: boolean; url: string };
}) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [url, setUrl] = useState(initial.url);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save(next: { enabled: boolean; url: string }) {
    setBusy(true); setMsg(null);
    const r = await fetch("/api/admin/engineering", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    setBusy(false);
    if (!r.ok) { const d = await r.json().catch(() => ({})); setMsg(d.error || "Failed."); return; }
    setMsg("Saved.");
  }

  return (
    <div className="card mb-8 p-4">
      <h2 className="font-display text-[12px] font-semibold uppercase tracking-[0.15em] text-ink/70">
        Engineering checker (client access)
      </h2>
      <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-ink/60">
        When on, <strong>Engineering</strong> appears in the client menu, and the
        page (<span className="font-mono">/engineering</span>) offers the checker
        link below. Per-client span-table sets aren&apos;t wired yet — that comes
        once the tables and access rules are ready.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          disabled={busy}
          onClick={() => { const n = !enabled; setEnabled(n); save({ enabled: n, url }); }}
          className={`rounded-md border px-3 py-1.5 text-[13px] ${
            enabled ? "border-seal/40 bg-[#EDF3EE] text-seal" : "border-rule bg-white text-ink/70"}`}>
          Client access: <span className="font-semibold">{enabled ? "ON" : "off"}</span>
        </button>
        <input
          className="field h-9 flex-1 min-w-[220px] py-1 text-[13px]"
          placeholder="Checker URL (e.g. https://…github.io/engineeringchecker/)"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onBlur={() => save({ enabled, url })}
        />
      </div>
      {msg && <p className="mt-2 text-[13px] text-ink/50">{msg}</p>}
    </div>
  );
}
