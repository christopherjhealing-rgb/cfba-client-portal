"use client";
import { useState } from "react";

type Mode = "signup" | "signin";

/**
 * The studio's front door: create a free account, or sign back into one.
 * There is deliberately no shortcut for CF Building Approvals portal clients —
 * the design tool is independent of the certifier's portal, so everyone here
 * signs in with a studio account of their own.
 */
export function StudioAuth() {
  const [mode, setMode] = useState<Mode>("signup");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function go(e: React.FormEvent) {
    e.preventDefault();
    // Catch a mistyped new password before it ever reaches the server.
    if (mode === "signup" && password !== confirm) {
      setMsg("Those two passwords don't match — check and try again.");
      return;
    }
    setBusy(true); setMsg(null);
    try {
      const r = await fetch(mode === "signup" ? "/api/studio/signup" : "/api/studio/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, password }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        // A 4xx carries a reason worth showing ("password too short", "already
        // an account"). A 5xx is our problem, not the client's details — say so,
        // rather than sending them to re-check a form that's fine.
        setMsg(
          d.error
          || (r.status >= 500
            ? "Something went wrong our end — please try again in a moment."
            : "That didn't work — check the details and try again."),
        );
        return;
      }
      window.location.assign("/studio/designs");
    } catch {
      setMsg("We couldn't reach the server — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const tab = (m: Mode, label: string) => (
    <button
      type="button"
      onClick={() => { setMode(m); setMsg(null); }}
      className={`rounded-md px-3 py-1.5 text-[13px] font-medium transition ${
        mode === m ? "bg-seal text-white" : "text-ink/60 hover:bg-seal/10"
      }`}
    >
      {label}
    </button>
  );

  return (
    <form onSubmit={go} className="card p-6">
      <div className="mb-5 flex flex-wrap gap-1.5">
        {tab("signup", "Create free account")}
        {tab("signin", "Sign in")}
      </div>

      <label className="label" htmlFor="st-email">Email</label>
      <input id="st-email" type="email" className="field" autoComplete="email"
        value={email} onChange={(e) => setEmail(e.target.value)} />
      {mode === "signup" && (
        <>
          <label className="label mt-3" htmlFor="st-name">Name or company <span className="text-ink/60">(optional)</span></label>
          <input id="st-name" className="field" autoComplete="organization"
            value={name} onChange={(e) => setName(e.target.value)} />
        </>
      )}

      <label className="label mt-3" htmlFor="st-pass">Password</label>
      <input id="st-pass" type="password" className="field"
        autoComplete={mode === "signup" ? "new-password" : "current-password"}
        value={password} onChange={(e) => setPassword(e.target.value)} />

      {mode === "signup" && (
        <>
          <label className="label mt-3" htmlFor="st-confirm">Confirm password</label>
          <input id="st-confirm" type="password" className="field" autoComplete="new-password"
            value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          {confirm.length > 0 && confirm !== password && (
            <p className="mt-1.5 text-[12px] text-brass-deep">Those don&apos;t match yet.</p>
          )}
        </>
      )}

      {msg && (
        <p role="alert" className="mt-3 rounded-md bg-[#FBEBEC] px-3 py-2 text-[13px] text-[#8C2630]">
          {msg}
        </p>
      )}

      <button className="btn mt-5 w-full" disabled={busy}>
        {busy ? "One moment…"
          : mode === "signup" ? "Create account & start drawing"
          : "Sign in"}
      </button>

      {mode === "signup" && (
        <p className="mt-3 text-[12px] leading-relaxed text-ink/60">
          Free, no card, no lock-in. Your email is your login and is never
          passed to anyone else.
        </p>
      )}
    </form>
  );
}
