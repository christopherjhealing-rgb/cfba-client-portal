"use client";
import { useState } from "react";

export function StaffLogin({ demo }: { demo?: boolean }) {
  const [passcode, setPasscode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const r = await fetch("/api/admin/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passcode }),
    });
    setBusy(false);
    if (r.ok) { window.location.href = "/admin"; return; }
    const d = await r.json().catch(() => ({}));
    setMsg(d.error || "That passcode isn't right.");
  }

  return (
    <form onSubmit={submit} className="card p-6">
      <label className="label" htmlFor="pc">Office passcode</label>
      <input id="pc" type="password" required autoFocus value={passcode}
        onChange={(e) => setPasscode(e.target.value)} className="field" />
      <button className="btn mt-5 w-full" disabled={busy}>
        {busy ? "Checking…" : "Sign in"}
      </button>
      {msg && <p className="mt-4 rounded-sm border-l-[3px] border-flag bg-[#FBECEC] px-3 py-2 text-[13px]">{msg}</p>}
      {demo && (
        <p className="mt-4 rounded-sm border-l-[3px] border-brass bg-[#FBF6EA] px-3 py-2 text-[13px]">
          Demo passcode: <span className="font-mono font-semibold">demo</span>
        </p>
      )}
    </form>
  );
}
