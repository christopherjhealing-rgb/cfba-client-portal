"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Staff "remove this job from the portal" — for a test job, or one whose
 * Monday card has been deleted/cancelled so it can't be cancelled the normal
 * way. Portal-side only; the confirm spells out that Monday is untouched and
 * that a card still on the board would just re-sync.
 */
export function RemoveJob({ jobRef, address }: { jobRef: string; address: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function remove() {
    if (!confirm(
      `Remove ${jobRef} — ${address || "this job"} — from the portal?\n\n` +
      `This deletes the portal's copy (files and messages) but does NOT touch ` +
      `Monday. If the card still exists on the board, the next sync will bring ` +
      `the job back, so remove it from Monday first.`
    )) return;
    setBusy(true); setMsg(null);
    try {
      const r = await fetch(`/api/admin/jobs/${encodeURIComponent(jobRef)}`, { method: "DELETE" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(d.error || "Couldn't remove it."); setBusy(false); return; }
      router.refresh();
    } catch {
      setMsg("Couldn't reach the server."); setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button onClick={remove} disabled={busy}
        className="text-[12px] font-medium text-flag underline underline-offset-2 disabled:opacity-50">
        {busy ? "Removing…" : "Remove from portal"}
      </button>
      {msg && <span className="text-[12px] text-flag">{msg}</span>}
    </span>
  );
}
