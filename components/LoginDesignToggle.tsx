"use client";
import { useState } from "react";

type Design = "new" | "classic";

/** Staff switch for the sign-in layout — the premium photo treatment or the
 *  original split panel. Applies on the next page load; no deploy. */
export function LoginDesignToggle({ initial }: { initial: Design }) {
  const [design, setDesign] = useState<Design>(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function choose(next: Design) {
    if (busy || next === design) return;
    setBusy(true); setMsg(null);
    const r = await fetch("/api/admin/login-design", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ design: next }),
    });
    setBusy(false);
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      setMsg(d.error || "Failed.");
      return;
    }
    setDesign(next);
  }

  return (
    <div className="card mb-8 p-4">
      <h2 className="font-display text-[12px] font-semibold uppercase tracking-[0.15em] text-ink/70">
        Sign-In Design
      </h2>
      <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-ink/60">
        Which sign-in page clients see. <strong>New</strong>{" "}
        is the full photo treatment; <strong>Classic</strong>{" "}
        is the original split panel. Switches on the next page load — no
        redeploy needed.
      </p>
      <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Sign-in design">
        {(["new", "classic"] as const).map((d) => {
          const active = design === d;
          return (
            <button
              key={d}
              role="radio"
              aria-checked={active}
              disabled={busy}
              onClick={() => choose(d)}
              className={`rounded-md border px-3 py-1.5 text-[13px] transition ${
                active
                  ? "border-seal/40 bg-[#EDF3EE] text-seal"
                  : "border-rule bg-white text-ink/70 hover:border-seal/50"
              }`}
            >
              <span aria-hidden="true">{active ? "●" : "○"}</span>{" "}
              <span className="font-semibold">{d === "new" ? "New" : "Classic"}</span>
            </button>
          );
        })}
      </div>
      {msg && <p className="mt-2 text-[13px] text-flag">{msg}</p>}
    </div>
  );
}
