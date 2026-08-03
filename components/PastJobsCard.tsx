"use client";
import { useState } from "react";

/** The list that lets a client pick a job we finished years ago instead of
 *  typing its reference from memory. Rebuilt on the 5pm schedule; this is for
 *  when somebody needs it now — a new client, or a job finished this morning. */
export function PastJobsCard({
  last,
}: {
  last: { at?: string; ok?: boolean; matched?: number; companies?: number; error?: string } | null;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ good: boolean; text: string } | null>(null);

  async function rebuild() {
    setBusy(true); setMsg(null);
    const r = await fetch("/api/admin/amendments", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rebuildHistory: true }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    setMsg(r.ok
      ? { good: true, text: `${d.matched} of ${d.scanned} jobs matched to ${d.companies} clients. ${d.unmatched} matched nobody.` }
      : { good: false, text: d.error || "That didn't work." });
  }

  return (
    <div className="card mb-6 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-display text-[12px] font-semibold uppercase tracking-[0.15em] text-ink/70">
            Past Jobs
          </p>
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-ink/60">
            The portal only holds current work, so a client amending a job we
            finished would have to type its reference from memory. This builds
            each client a list of everything we&apos;ve ever done for them, so
            they can pick it instead. It rebuilds itself at 5pm.
          </p>
        </div>
        <button onClick={rebuild} disabled={busy} className="btn-ghost shrink-0">
          {busy ? "Reading the board…" : "Rebuild Now"}
        </button>
      </div>
      <p className="mt-3 border-t border-rule pt-3 text-[12px] text-ink/50">
        {last?.at
          ? <>Last built {new Date(last.at).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
              {last.ok
                ? ` — ${last.matched ?? 0} jobs across ${last.companies ?? 0} clients.`
                : <span className="text-flag"> — failed: {last.error}</span>}</>
          : "Never built. Clients can still type a reference; this just saves them the trouble."}
      </p>
      {msg && <p className={`mt-2 text-[13px] ${msg.good ? "text-seal" : "text-flag"}`}>{msg.text}</p>}
    </div>
  );
}
