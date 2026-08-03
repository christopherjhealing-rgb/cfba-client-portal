"use client";
import { useState } from "react";

interface Footprint {
  name: string; jobs: number; files: number; messages: number; logins: number; refs: string[];
}

/**
 * Two clicks to delete a client, and the second one names what it costs.
 *
 * "Are you sure?" is not a safety feature — it's a reflex people learn to
 * click through. So the confirm asks the server what this client actually
 * owns and puts the numbers on the button. Nobody deletes three jobs and
 * eleven files thinking they cleaned up an empty test account.
 */
export function DeleteClient({ companyId, companyName }: { companyId: string; companyName: string }) {
  const [fp, setFp] = useState<Footprint | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function ask() {
    setBusy(true); setMsg(null);
    const r = await fetch(`/api/admin/companies?id=${encodeURIComponent(companyId)}`);
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg(d.error || "Couldn't check what this client holds."); return; }
    setFp(d);
  }

  async function reallyDelete() {
    if (!fp) return;
    setBusy(true); setMsg(null);
    const r = await fetch("/api/admin/companies", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: companyId, confirmJobs: fp.jobs }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg(d.error || "That didn't delete."); setFp(null); return; }
    window.location.href = "/admin/clients";
  }

  if (!fp) {
    return (
      <div className="mt-3 border-t border-rule pt-3">
        <button onClick={ask} disabled={busy}
          className="text-[13px] text-flag underline underline-offset-2 disabled:opacity-50">
          {busy ? "Checking…" : "Delete this client"}
        </button>
        {msg && <p className="mt-2 text-[13px] text-flag">{msg}</p>}
      </div>
    );
  }

  const has = fp.jobs + fp.files + fp.messages + fp.logins > 0;
  return (
    <div className="mt-3 rounded-lg border border-flag/40 bg-[#FBECEC] px-4 py-3.5">
      <p className="text-[13px] font-semibold text-flag">
        Delete {companyName}? This can&apos;t be undone.
      </p>
      {has ? (
        <>
          <p className="mt-1.5 text-[13px] text-ink/75">It takes with it:</p>
          <ul className="mt-1 space-y-0.5 text-[13px] text-ink/75">
            {fp.jobs > 0 && <li>· <strong>{fp.jobs}</strong> job{fp.jobs === 1 ? "" : "s"} {fp.refs.length > 0 && <span className="font-mono text-[12px] text-ink/50">({fp.refs.join(", ")}{fp.jobs > fp.refs.length ? "…" : ""})</span>}</li>}
            {fp.files > 0 && <li>· <strong>{fp.files}</strong> stored file{fp.files === 1 ? "" : "s"} — deleted from storage</li>}
            {fp.messages > 0 && <li>· <strong>{fp.messages}</strong> message{fp.messages === 1 ? "" : "s"}</li>}
            {fp.logins > 0 && <li>· <strong>{fp.logins}</strong> login{fp.logins === 1 ? "" : "s"} — they can no longer sign in</li>}
          </ul>
        </>
      ) : (
        <p className="mt-1.5 text-[13px] text-ink/75">
          Nothing hangs off this client — no jobs, files, messages or logins.
        </p>
      )}
      <p className="mt-2 text-[12px] text-ink/60">
        Their Monday cards are <strong>not</strong>{" "}touched — this portal isn&apos;t the
        system of record. Any card still on the board comes back on the next sync as an
        unmatched client.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={reallyDelete} disabled={busy}
          className="rounded-md bg-flag px-3.5 py-2 text-[13px] font-semibold text-white transition hover:opacity-90 disabled:opacity-50">
          {busy ? "Deleting…"
            : fp.jobs > 0 ? `Yes — delete ${companyName} and ${fp.jobs} job${fp.jobs === 1 ? "" : "s"}`
            : `Yes — delete ${companyName}`}
        </button>
        <button onClick={() => { setFp(null); setMsg(null); }} className="btn-ghost">Cancel</button>
      </div>
      {msg && <p className="mt-2 text-[13px] text-flag">{msg}</p>}
    </div>
  );
}
