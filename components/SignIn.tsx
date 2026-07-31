"use client";
import { useState } from "react";
import { Icon } from "./Icon";

type Mode = "signin" | "setup";

export function SignIn({ demo }: { demo?: boolean }) {
  const [mode, setMode] = useState<Mode>("signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [setupCode, setSetupCode] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);

  async function post(url: string, payload: Record<string, unknown>) {
    setBusy(true); setMsg(null);
    const r = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    return { ok: r.ok, d };
  }

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    const { ok, d } = await post("/api/auth/login", { username, password, remember });
    if (ok) { window.location.href = "/dashboard"; return; }
    setMsg(d.error || "Something went wrong.");
    if (d.needsSetup) setMode("setup");
  }

  async function doSetup(e: React.FormEvent) {
    e.preventDefault();
    const { ok, d } = await post("/api/auth/set-password", {
      username, setupCode, password, confirm,
    });
    if (ok) { window.location.href = "/dashboard"; return; }
    setMsg(d.error || "Something went wrong.");
  }

  return (
    <div className="card p-6 sm:p-7">
      <div className="mb-5 flex gap-1 rounded-sm bg-wash p-1">
        <button type="button" onClick={() => { setMode("signin"); setMsg(null); }}
          className={`flex-1 rounded-sm px-3 py-2 font-display text-[11px] font-semibold uppercase tracking-[0.08em] transition ${
            mode === "signin" ? "bg-white text-ink shadow-sm" : "text-ink/55"}`}>
          Sign in
        </button>
        <button type="button" onClick={() => { setMode("setup"); setMsg(null); }}
          className={`flex-1 rounded-sm px-3 py-2 font-display text-[11px] font-semibold uppercase tracking-[0.08em] transition ${
            mode === "setup" ? "bg-white text-ink shadow-sm" : "text-ink/55"}`}>
          First time
        </button>
      </div>

      {mode === "signin" ? (
        <form onSubmit={signIn}>
          <label className="label" htmlFor="username">Username</label>
          <input id="username" required autoFocus autoCapitalize="none" autoCorrect="off"
            value={username} onChange={(e) => setUsername(e.target.value)}
            className="field" placeholder="yourcompany" />
          <label className="label mt-4" htmlFor="password">Password</label>
          <div className="relative">
            <input id="password" type={show ? "text" : "password"} required value={password}
              onChange={(e) => setPassword(e.target.value)} className="field pr-11"
              placeholder="••••••••••" />
            <button type="button" onClick={() => setShow((v) => !v)}
              aria-label={show ? "Hide password" : "Show password"}
              className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-ink/40 transition hover:bg-wash hover:text-ink/70">
              <Icon name={show ? "eyeOff" : "eye"} size={17} />
            </button>
          </div>
          <div className="mt-3.5 flex items-center justify-between gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-[13px] text-ink/70">
              <input type="checkbox" checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="h-4 w-4 rounded border-rule text-seal accent-[#1E5B3C]" />
              Remember me
            </label>
            <button type="button" disabled={busy}
              onClick={async () => {
                if (!username.trim()) { setMsg("Enter your username first."); return; }
                setBusy(true); setMsg(null);
                const r = await fetch("/api/auth/recover", {
                  method: "POST", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ username }),
                });
                const d = await r.json().catch(() => ({}));
                setBusy(false);
                setMsg(d.message || "Check your email for a setup code.");
                setMode("setup");
              }}
              className="text-[13px] font-medium text-seal underline underline-offset-2">
              Forgot password?
            </button>
          </div>
          <button className="btn mt-4 w-full" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <p className="mt-3 text-center text-[13px] text-ink/55">
            Forgotten your password? Contact the CFBA office and we&apos;ll issue a new setup code.
          </p>
        </form>
      ) : (
        <form onSubmit={doSetup}>
          <p className="mb-4 text-[13px] leading-relaxed text-ink/65">
            CFBA has given your company a username and a one-time setup code.
            Enter them here and choose your own password.
          </p>
          <label className="label" htmlFor="su">Username</label>
          <input id="su" required autoFocus autoCapitalize="none" autoCorrect="off"
            value={username} onChange={(e) => setUsername(e.target.value)}
            className="field" placeholder="yourcompany" />
          <label className="label mt-4" htmlFor="sc">Setup code</label>
          <input id="sc" required value={setupCode}
            onChange={(e) => setSetupCode(e.target.value.toUpperCase())}
            className="field font-mono tracking-[0.12em]" placeholder="XXX-XXX-XXX" />
          <label className="label mt-4" htmlFor="np">Choose a password</label>
          <input id="np" type="password" required value={password}
            onChange={(e) => setPassword(e.target.value)} className="field"
            placeholder="at least 10 characters" />
          <label className="label mt-4" htmlFor="cp">Confirm password</label>
          <input id="cp" type="password" required value={confirm}
            onChange={(e) => setConfirm(e.target.value)} className="field" />
          <button className="btn mt-5 w-full" disabled={busy}>
            {busy ? "Setting up…" : "Set password and sign in"}
          </button>
        </form>
      )}

      {msg && (
        <p className="mt-4 rounded-sm border-l-[3px] border-flag bg-[#FBECEC] px-3 py-2 text-[13px] text-ink/80">
          {msg}
        </p>
      )}

      {demo && (
        <div className="mt-5 rounded-sm border-l-[3px] border-brass bg-[#FBF6EA] px-3 py-2.5 text-[13px] leading-relaxed">
          <div className="font-display text-[10px] font-semibold uppercase tracking-[0.12em] text-ink/55">
            Test client
          </div>
          <div className="mt-1">
            Sign in: <span className="font-mono font-semibold">cfba.test</span> /{" "}
            <span className="font-mono font-semibold">TestDryRun2026</span>
          </div>
          <div className="mt-1">
            First-time flow: <span className="font-mono font-semibold">cfba.setup</span> with code{" "}
            <span className="font-mono font-semibold">AAA-BBB-CCC</span>
          </div>
        </div>
      )}
    </div>
  );
}
