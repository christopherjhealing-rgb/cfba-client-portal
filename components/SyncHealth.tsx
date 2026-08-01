"use client";
import { useState } from "react";

interface LastSync {
  at?: string; ok?: boolean; error?: string;
  issuedSeen?: number; filesCopied?: number; jobsUpserted?: number;
  messagesPulled?: number; filesPurged?: number;
  unmatched?: { ref: string; client: string }[];
  issuedNoFiles?: string[]; emailsSent?: number; emailFails?: string[];
}

function ago(iso?: string): string {
  if (!iso) return "never";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  return `${Math.floor(h / 24)} day${Math.floor(h / 24) === 1 ? "" : "s"} ago`;
}

export function SyncHealth({
  last,
  companies,
}: {
  last: LastSync | null;
  companies: { id: string; name: string }[];
}) {
  const [unmatched, setUnmatched] = useState(last?.unmatched || []);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const stale = last?.at
    ? Date.now() - new Date(last.at).getTime() > 60 * 60 * 1000
    : true;
  const failed = last && last.ok === false;

  async function resolve(spelling: string, body: Record<string, unknown>) {
    setBusy(spelling); setMsg(null);
    const r = await fetch("/api/admin/match", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spelling, ...body }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok) { setMsg(d.error || "Failed."); return; }
    setUnmatched((prev) => prev.filter((u) => u.client !== spelling));
    setMsg(`Matched "${spelling}" — its jobs appear on the next sync.`);
  }

  // group unmatched by spelling so each distinct client name shows once
  const bySpelling = new Map<string, number>();
  for (const u of unmatched) bySpelling.set(u.client, (bySpelling.get(u.client) || 0) + 1);

  const bannerClass = failed
    ? "border-flag/40 bg-[#FBECEC] text-flag"
    : stale
    ? "border-brass/40 bg-[#FBF4E6] text-brass"
    : "border-seal/30 bg-[#EDF3EE] text-seal";

  return (
    <div className="mb-8">
      <div className={`rounded-lg border px-4 py-3 text-[13px] ${bannerClass}`}>
        {failed ? (
          <><strong>Last sync failed</strong> {ago(last?.at)} — {last?.error}</>
        ) : stale ? (
          <><strong>Sync is stale</strong> — last ran {ago(last?.at)}. Check Vercel cron and the Monday token.</>
        ) : (
          <><strong>Sync healthy</strong> — {ago(last?.at)} · {last?.jobsUpserted ?? 0} jobs,
            {" "}{last?.filesCopied ?? 0} files, {last?.messagesPulled ?? 0} messages
            {(last?.emailsSent ?? 0) > 0 ? `, ${last?.emailsSent} issued email${(last?.emailsSent ?? 0) === 1 ? "" : "s"} sent` : ""}
            {(last?.filesPurged ?? 0) > 0 ? `, ${last?.filesPurged} purged` : ""}</>
        )}
      </div>

      {(last?.issuedNoFiles?.length ?? 0) > 0 && (
        <div className="mt-3 rounded-lg border border-brass/40 bg-[#FBF4E6] px-4 py-3 text-[13px] text-brass">
          <strong>Issued on Monday, but no files found</strong> — the certificate
          isn&apos;t downloadable and no email has gone for:{" "}
          <span className="font-mono">{last?.issuedNoFiles?.join(", ")}</span>.
          Put the package in the job&apos;s SharePoint folder; the next sync picks
          it up and sends the email.
        </div>
      )}

      {(last?.emailFails?.length ?? 0) > 0 && (
        <div className="mt-3 rounded-lg border border-flag/40 bg-[#FBECEC] px-4 py-3 text-[13px] text-flag">
          <strong>Issued email didn&apos;t send</strong> — the job is downloadable
          in the portal, but the client wasn&apos;t told:{" "}
          {last?.emailFails?.join("; ")}. Fix the cause (client email address /
          mailbox), then tell the client yourself — this email won&apos;t retry.
        </div>
      )}

      {bySpelling.size > 0 && (
        <div className="card mt-3 p-4">
          <h2 className="font-display text-[12px] font-semibold uppercase tracking-[0.15em] text-ink/70">
            Unmatched Monday clients ({bySpelling.size})
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
      )}
    </div>
  );
}
