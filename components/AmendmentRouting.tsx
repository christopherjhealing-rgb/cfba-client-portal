"use client";
import { useState } from "react";

interface Route { name: string; email: string }

/**
 * Who amendments go to.
 *
 * Names are matched against the board's "Certified By" column, so they have to
 * be spelled the way Monday spells them — that's why the known names are
 * offered rather than left to memory. The fallback is what catches a job
 * nobody has certified yet, and without one an amendment would land nowhere
 * and the client would never know.
 */
export function AmendmentRouting({
  initial, knownNames,
}: {
  initial: { routes: Route[]; fallbackName: string };
  knownNames: string[];
}) {
  const [routes, setRoutes] = useState<Route[]>(
    initial.routes.length ? initial.routes : [{ name: "", email: "" }]
  );
  const [fallbackName, setFallback] = useState(initial.fallbackName);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ good: boolean; text: string } | null>(null);
  const [dirty, setDirty] = useState(false);

  const edit = (fn: () => void) => { fn(); setDirty(true); setMsg(null); };

  const setRoute = (i: number, patch: Partial<Route>) =>
    edit(() => setRoutes((r) => r.map((x, n) => (n === i ? { ...x, ...patch } : x))));

  async function save() {
    const clean = routes.filter((r) => r.name.trim() && r.email.trim());
    if (!clean.length) { setMsg({ good: false, text: "Add at least one person." }); return; }
    if (!clean.some((r) => r.name.trim() === fallbackName.trim())) {
      setMsg({ good: false, text: "The fallback has to be one of the people above." });
      return;
    }
    setBusy(true); setMsg(null);
    const r = await fetch("/api/admin/amendments", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config: { routes: clean, fallbackName: fallbackName.trim() } }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg({ good: false, text: d.error || "That didn't save." }); return; }
    setDirty(false);
    setMsg({ good: true, text: "Saved." });
  }

  return (
    <div className="card mb-8 p-4">
      <h2 className="font-display text-[12px] font-semibold uppercase tracking-[0.15em] text-ink/70">
        Amendments
      </h2>
      <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-ink/60">
        An amendment lodged through the portal never opens a Monday card. It
        emails whoever certified the original, with the office copied, and they
        reply &ldquo;yes&rdquo; as they always have. Names below must match the
        board&apos;s <strong>Certified By</strong> column exactly.
      </p>

      <div className="mt-3 space-y-2">
        {routes.map((r, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <input
              value={r.name}
              onChange={(e) => setRoute(i, { name: e.target.value })}
              placeholder="Name on the board"
              list="cfba-certifiers"
              className="min-w-[180px] flex-1 rounded-md border border-rule px-3 py-2 text-[13px] outline-none focus:border-seal"
            />
            <input
              value={r.email}
              onChange={(e) => setRoute(i, { email: e.target.value })}
              placeholder="name@cfba.com.au"
              inputMode="email" spellCheck={false}
              className="min-w-[220px] flex-1 rounded-md border border-rule px-3 py-2 font-mono text-[12px] outline-none focus:border-seal"
            />
            {routes.length > 1 && (
              <button className="btn-ghost"
                onClick={() => edit(() => setRoutes((x) => x.filter((_, n) => n !== i)))}>
                Remove
              </button>
            )}
          </div>
        ))}
        <datalist id="cfba-certifiers">
          {knownNames.map((n) => <option key={n} value={n} />)}
        </datalist>
        <button className="btn-ghost"
          onClick={() => edit(() => setRoutes((r) => [...r, { name: "", email: "" }]))}>
          Add Someone
        </button>
      </div>

      <label className="mt-4 block">
        <span className="font-display text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/55">
          If nobody is in Certified By
        </span>
        <p className="mt-1 text-[12.5px] text-ink/50">
          Send it to this person. Without it an amendment lands nowhere and the
          client is left thinking it&apos;s with you.
        </p>
        <select
          value={fallbackName}
          onChange={(e) => edit(() => setFallback(e.target.value))}
          className="mt-1.5 rounded-md border border-rule px-3 py-2 text-[13px] outline-none focus:border-seal"
        >
          <option value="">— pick someone —</option>
          {routes.filter((r) => r.name.trim()).map((r) => (
            <option key={r.name} value={r.name}>{r.name}</option>
          ))}
        </select>
      </label>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-rule pt-3">
        <button onClick={save} disabled={busy || !dirty} className="btn-ghost">
          {busy ? "…" : dirty ? "Save" : "Saved"}
        </button>
        {msg && (
          <span className={`text-[13px] ${msg.good ? "text-seal" : "text-flag"}`}>{msg.text}</span>
        )}
      </div>
    </div>
  );
}
