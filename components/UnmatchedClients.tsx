"use client";
import { useState } from "react";

/**
 * The unmatched-clients fixer. A board card whose Client spelling matches no
 * portal client is invisible — its jobs and messages reach nobody — so each
 * spelling here is attached to the right client, or turned into a new one.
 *
 * Lifted off the admin home page onto its own page so the home stays a
 * glance-and-go queue; the count still surfaces on home as a one-line alert.
 */
export function UnmatchedClients({
  unmatched,
  companies,
}: {
  unmatched: { ref: string; client: string }[];
  companies: { id: string; name: string }[];
}) {
  const [rows, setRows] = useState(unmatched);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function resolve(spelling: string, body: Record<string, unknown>) {
    setBusy(spelling); setMsg(null);
    const r = await fetch("/api/admin/match", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spelling, ...body }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok) { setMsg(d.error || "Failed."); return; }
    setRows((prev) => prev.filter((u) => u.client !== spelling));
    setMsg(`Matched "${spelling}" — its jobs appear on the next sync.`);
  }

  // Group by spelling so each distinct client name shows once, with its count.
  const bySpelling = new Map<string, number>();
  for (const u of rows) bySpelling.set(u.client, (bySpelling.get(u.client) || 0) + 1);

  if (bySpelling.size === 0) {
    return (
      <div className="card p-8 text-center">
        <p className="font-display text-[18px] font-semibold text-ink">Everything&apos;s matched</p>
        <p className="mx-auto mt-2 max-w-sm text-[14px] text-ink/60">
          Every board card&apos;s Client is attached to a portal client, so all
          jobs and messages are reaching someone. New unmatched spellings show
          up here after a sync.
        </p>
      </div>
    );
  }

  return (
    <div className="card p-4">
      <h2 className="font-display text-[12px] font-semibold uppercase tracking-[0.15em] text-ink/70">
        Unmatched Monday Clients ({bySpelling.size})
      </h2>
      <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-ink/60">
        These board cards didn&apos;t match any client here, so their jobs and
        messages aren&apos;t reaching anyone. Attach each spelling to the right
        client, or create a new one.
      </p>
      <ul className="mt-3 divide-y divide-rule">
        {[...bySpelling.entries()].map(([spelling, n]) => (
          <li key={spelling} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
            <div className="min-w-0">
              <span className="text-[13px] font-medium">{spelling || "(blank)"}</span>
              <span className="ml-2 text-[12px] text-ink/45">{n} job{n === 1 ? "" : "s"}</span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <select
                className="field h-9 max-w-[200px] py-1 text-[13px]"
                disabled={busy === spelling}
                defaultValue=""
                onChange={(e) => e.target.value && resolve(spelling, { companyId: e.target.value })}
              >
                <option value="" disabled>Add as alias to…</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <button
                className="btn-ghost"
                disabled={busy === spelling || !spelling}
                onClick={() => resolve(spelling, { createNew: true })}
              >
                New client
              </button>
            </div>
          </li>
        ))}
      </ul>
      {msg && <p className="mt-2 text-[13px] text-seal">{msg}</p>}
    </div>
  );
}
