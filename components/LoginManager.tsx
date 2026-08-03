"use client";
import { useState } from "react";
import { suggestUsername } from "@/lib/core.mjs";

export function LoginManager({
  companyId, companyName, existing,
}: { companyId: string; companyName: string; existing: string[] }) {
  const [open, setOpen] = useState(false);
  // Suggested from the client name, and editable — nobody should have to
  // type "kaciespatiosandsheds" by hand.
  const [username, setUsername] = useState(() => suggestUsername(companyName));
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<
    { username: string; setupCode: string; emailed?: boolean; emailError?: string } | null
  >(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function call(action: "create" | "reset", u: string) {
    setBusy(true); setMsg(null); setIssued(null);
    const r = await fetch("/api/admin/logins", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, companyId, username: u, displayName, email }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg(d.error || "Failed."); return; }
    setIssued({ username: d.username, setupCode: d.setupCode, emailed: d.emailed, emailError: d.emailError });
  }

  if (!open) {
    return (
      <div className="mt-3 border-t border-rule pt-3">
        <button className="text-[13px] text-seal underline" onClick={() => setOpen(true)}>
          {existing.length ? "Issue another login / reset a password" : "Issue a login"}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3 border-t border-rule pt-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[160px] flex-1">
          <label className="label">New Username for {companyName}</label>
          <input className="field" value={username} autoCapitalize="none"
            onChange={(e) => setUsername(e.target.value)} placeholder="yourcompany" />
        </div>
        <div className="min-w-[140px] flex-1">
          <label className="label">Person&apos;s Name (optional)</label>
          <input className="field" value={displayName}
            onChange={(e) => setDisplayName(e.target.value)} placeholder="Joe Bloggs" />
        </div>
        <div className="min-w-[180px] flex-1">
          <label className="label">Email It To (optional)</label>
          <input className="field" type="email" value={email} autoCapitalize="none"
            onChange={(e) => setEmail(e.target.value)} placeholder="kacie@cfba.com.au" />
        </div>
        <button className="btn" disabled={busy || !username} onClick={() => call("create", username)}>
          {busy ? "…" : "Create"}
        </button>
        <button className="btn-ghost" onClick={() => { setOpen(false); setIssued(null); setMsg(null); }}>
          Close
        </button>
      </div>

      {existing.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px]">
          <span className="text-ink/55">Reset a password:</span>
          {existing.map((u) => (
            <button key={u} className="chip normal-case tracking-normal underline"
              disabled={busy} onClick={() => call("reset", u)}>
              {u}
            </button>
          ))}
        </div>
      )}

      {issued && (
        <div className="mt-3 rounded-sm border-l-[3px] border-seal bg-[#EDF3EE] px-3 py-2.5 text-[13px]">
          <div className="font-display text-[10px] font-semibold uppercase tracking-[0.12em] text-ink/55">
            Give these to the client — the code works once
          </div>
          <div className="mt-1.5">
            Username: <span className="font-mono font-semibold">{issued.username}</span>
          </div>
          <div>
            Setup code: <span className="font-mono font-semibold">{issued.setupCode}</span>
          </div>
          <div className="mt-1.5 text-ink/55">
            They enter these under &ldquo;First time&rdquo; on the sign-in page and choose their own password.
          </div>
          {/* Said plainly either way. "Emailed" when it wasn't is how a client
              sits waiting for something nobody sent. */}
          <div className={`mt-2 ${issued.emailed ? "text-seal" : "text-flag"}`}>
            {issued.emailed
              ? "✓ Emailed to them, with the getting-started guide attached."
              : `✕ Not emailed — ${issued.emailError || "no address given"}. Read the code out or paste it to them.`}
          </div>
        </div>
      )}
      {msg && <p className="mt-3 text-[13px] text-flag">{msg}</p>}
    </div>
  );
}
