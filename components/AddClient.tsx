"use client";
import { useState } from "react";

/** Staff form for adding a company to the portal's client registry. Sync only
 *  attaches Monday cards to companies that exist here, so this is where a
 *  client's portal presence begins. */
export function AddClient() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [emails, setEmails] = useState("");
  const [aliases, setAliases] = useState("");
  const [isTest, setIsTest] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function create() {
    setBusy(true); setMsg(null);
    const r = await fetch("/api/admin/companies", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, emails, aliases, isTest }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg(d.error || "Failed."); return; }
    window.location.reload();
  }

  if (!open) {
    return (
      <div className="mb-4">
        <button className="btn" onClick={() => setOpen(true)}>Add a client</button>
      </div>
    );
  }

  return (
    <div className="card mb-4 p-4">
      <div className="font-medium">Add a client</div>
      <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-ink/65">
        The name should match the Client column on Monday — suffixes like
        &ldquo;Pty Ltd&rdquo; and anything in brackets are ignored automatically.
        If the board spells them several ways, list the other spellings as aliases.
        Jobs whose card has a matching email attach regardless of spelling.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Client name</label>
          <input className="field" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Ventura Homes" />
        </div>
        <div>
          <label className="label">Contact emails (comma separated, optional)</label>
          <input className="field" value={emails} onChange={(e) => setEmails(e.target.value)}
            placeholder="permits@ventura.com.au" />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Other Monday spellings (comma separated, optional)</label>
          <input className="field" value={aliases} onChange={(e) => setAliases(e.target.value)}
            placeholder="Ventura, Ventura Home Group" />
        </div>
      </div>
      <label className="mt-3 flex items-center gap-2 text-[13px]">
        <input type="checkbox" checked={isTest} onChange={(e) => setIsTest(e.target.checked)} />
        Test client (shown with a Test chip, for your own trial logins)
      </label>
      <div className="mt-3 flex gap-2">
        <button className="btn" disabled={busy || name.trim().length < 2} onClick={create}>
          {busy ? "…" : "Create client"}
        </button>
        <button className="btn-ghost" onClick={() => { setOpen(false); setMsg(null); }}>
          Cancel
        </button>
      </div>
      {msg && <p className="mt-3 text-[13px] text-flag">{msg}</p>}
    </div>
  );
}
