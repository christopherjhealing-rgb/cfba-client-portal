"use client";
import { useState } from "react";

export function SyncButton() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function run() {
    setBusy(true); setResult(null);
    const r = await fetch("/api/sync", { method: "POST" });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setResult(d.error || "Sync failed."); return; }
    setResult(
      d.note ||
      `${d.issuedSeen} issued · ${d.filesCopied} files copied · ${d.jobsUpserted} jobs updated` +
      (d.unmatched?.length ? ` · ${d.unmatched.length} unmatched` : "")
    );
    setTimeout(() => window.location.reload(), 1200);
  }

  return (
    <div className="flex flex-col items-end">
      <button onClick={run} className="btn" disabled={busy}>
        {busy ? "Syncing…" : "Run Sync"}
      </button>
      {result && <span className="mt-1 max-w-[280px] text-right text-[11px] text-ink/55">{result}</span>}
    </div>
  );
}
