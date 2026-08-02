"use client";
import { useState } from "react";

/** Staff reply on a general enquiry. No attachments and no Monday post: an
 *  enquiry has no card, and anything needing drawings attached is a job, not
 *  an enquiry — the answer to that one is "lodge it". */
export function EnquiryReply({ companyId }: { companyId: string }) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true); setMsg(null);
    const r = await fetch("/api/admin/enquiries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId, body }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg(d.error || "That didn't send. Try again."); return; }
    if (!d.emailed) {
      // Saved but not emailed — the client sees it next time they sign in,
      // which is not the same thing as being told. Say so rather than a tick.
      setMsg("Saved to their portal, but the email didn't go — ring or email them.");
      return;
    }
    setBody("");
    window.location.reload();
  }

  return (
    <form onSubmit={send} className="border-t border-rule bg-wash p-4">
      <label className="label" htmlFor={`reply-${companyId}`}>Reply</label>
      <textarea id={`reply-${companyId}`} rows={3} value={body}
        onChange={(e) => setBody(e.target.value)}
        className="field resize-y"
        placeholder="Your answer. It goes into their portal and to their email." />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button className="btn" disabled={busy || !body.trim()}>
          {busy ? "Sending…" : "Send Reply"}
        </button>
        {msg && <span className="text-[13px] text-flag">{msg}</span>}
      </div>
    </form>
  );
}
