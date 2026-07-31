"use client";
import { useState } from "react";

export function DecisionButtons({ id }: { id: string }) {
  const [busy, setBusy] = useState<"accept" | "reject" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");

  async function decide(decision: "accept" | "reject") {
    setBusy(decision); setMsg(null);
    const r = await fetch("/api/admin/decision", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, decision, note }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok) { setMsg(d.error || "Failed."); return; }
    window.location.reload();
  }

  if (rejecting) {
    return (
      <div className="w-full max-w-xs">
        <textarea rows={2} className="field" placeholder="Reason for the client (optional)"
          value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="mt-2 flex gap-2">
          <button className="btn-ghost flex-1" onClick={() => setRejecting(false)}>Cancel</button>
          <button className="btn flex-1" disabled={busy !== null} onClick={() => decide("reject")}>
            {busy === "reject" ? "…" : "Confirm reject"}
          </button>
        </div>
        {msg && <p className="mt-2 text-[12px] text-flag">{msg}</p>}
      </div>
    );
  }

  return (
    <div className="flex shrink-0 gap-2">
      <button className="btn-ghost" onClick={() => setRejecting(true)}>Reject</button>
      <button className="btn" disabled={busy !== null} onClick={() => decide("accept")}>
        {busy === "accept" ? "Creating…" : "Accept → Monday"}
      </button>
      {msg && <p className="text-[12px] text-flag">{msg}</p>}
    </div>
  );
}
