"use client";
import { useState } from "react";

/** Staff switches for hiding client-facing sections while they're updated. */
export function PageToggles({
  pages,
  initialDisabled,
}: {
  pages: { key: string; label: string }[];
  initialDisabled: string[];
}) {
  const [disabled, setDisabled] = useState(() => new Set(initialDisabled));
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function flip(key: string) {
    const next = !disabled.has(key);
    setBusy(key); setMsg(null);
    const r = await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, disabled: next }),
    });
    setBusy(null);
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      setMsg(d.error || "Failed.");
      return;
    }
    setDisabled((prev) => {
      const s = new Set(prev);
      if (next) s.add(key); else s.delete(key);
      return s;
    });
  }

  return (
    <div className="card mb-8 p-4">
      <h2 className="font-display text-[12px] font-semibold uppercase tracking-[0.15em] text-ink/70">
        Portal Pages
      </h2>
      <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-ink/60">
        Switch a section off while you update it — its link disappears from the
        client sidebar, the page shows &ldquo;temporarily unavailable&rdquo;, and
        the matching actions are paused. Everything else stays live. Takes
        effect on the next page load; no redeploy needed.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {pages.map((p) => {
          const off = disabled.has(p.key);
          return (
            <button
              key={p.key}
              disabled={busy === p.key}
              onClick={() => flip(p.key)}
              className={`rounded-md border px-3 py-1.5 text-[13px] transition ${
                off
                  ? "border-flag/40 bg-[#FBECEC] text-flag"
                  : "border-rule bg-white text-ink/75 hover:border-seal/50"
              }`}
            >
              {p.label}: <span className="font-semibold">{busy === p.key ? "…" : off ? "OFF" : "on"}</span>
            </button>
          );
        })}
      </div>
      {msg && <p className="mt-2 text-[13px] text-flag">{msg}</p>}
    </div>
  );
}
