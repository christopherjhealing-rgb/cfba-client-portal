"use client";
import { useRef, useState } from "react";
import { uploadDirect } from "@/lib/upload-client";

export interface AmendmentRow {
  id: string;
  parentRef: string;
  company: string;
  address: string;
  reason: string;
  notes: string;
  files: string[];
  routedTo: string;
  createdAt: string;
  days: number;
  done: boolean;
  issuedFiles: string[];
}

/** Kacie's list. An amendment is answered by email — the only thing that
 *  happens here is the revised certificate going back, which has to happen
 *  here because with no Monday card there's no SharePoint sync to collect it. */
export function AmendmentList({ rows }: { rows: AmendmentRow[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ id: string; good: boolean; text: string } | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  async function issue(id: string, list: FileList | null) {
    const picked = [...(list || [])];
    if (!picked.length) return;
    const bad = picked.filter((f) => !/\.pdf$/i.test(f.name)).map((f) => f.name);
    if (bad.length) { setMsg({ id, good: false, text: `PDFs only — ${bad.join(", ")}` }); return; }

    setBusy(id); setMsg(null);
    const up = await uploadDirect("form", picked);
    if ("error" in up) { setBusy(null); setMsg({ id, good: false, text: up.error }); return; }
    if (up.mode === "inline") {
      setBusy(null); setMsg({ id, good: false, text: "Not available in demo mode." }); return;
    }
    const r = await fetch("/api/admin/amendments", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, issue: true, draftId: up.draftId, names: up.names }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok) { setMsg({ id, good: false, text: d.error || "That didn't work." }); return; }
    setDone((s) => new Set(s).add(id));
    setMsg({
      id, good: true,
      text: d.emailed
        ? `Sent — ${d.files} file${d.files === 1 ? "" : "s"} are in their portal and they've been emailed.`
        : `Uploaded, but the email didn't send. Ring them.`,
    });
  }

  async function resend(id: string) {
    setBusy(id); setMsg(null);
    const r = await fetch("/api/admin/amendments", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, resend: true }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(null);
    setMsg({ id, good: r.ok, text: r.ok ? `Sent again to ${d.to}.` : (d.error || "It didn't send.") });
  }

  if (!rows.length) {
    return (
      <p className="empty">
        No amendments waiting. They arrive here when a client lodges one, and go
        out by email to whoever certified the original.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((a) => {
        const sent = done.has(a.id) || a.done;
        return (
          <div key={a.id} className="card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[12px] text-seal">{a.parentRef}</span>
                  <span className="font-medium">{a.address || "—"}</span>
                  {sent
                    ? <span className="chip chip-seal">Sent back</span>
                    : a.days >= 3
                      ? <span className="chip chip-brass">{a.days} days</span>
                      : null}
                </div>
                <div className="mt-0.5 text-[13px] text-ink/60">{a.company}</div>

                <div className="mt-2 rounded-sm border-l-[3px] border-brass bg-[#FBF4E6] px-3 py-1.5 text-[13px] text-ink/80">
                  <span className="font-display text-[10px] font-semibold uppercase tracking-[0.1em] text-ink/60">
                    Why
                  </span>
                  <div className="mt-0.5 whitespace-pre-wrap">{a.reason || "(none given)"}</div>
                </div>

                {a.notes && (
                  <div className="mt-2 rounded-sm border-l-[3px] border-rule bg-wash px-3 py-1.5 text-[13px] text-ink/70">
                    <div className="whitespace-pre-wrap">{a.notes}</div>
                  </div>
                )}

                {a.files.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {a.files.map((f) => (
                      <li key={f} className="chip normal-case tracking-normal">{f}</li>
                    ))}
                  </ul>
                )}

                <div className="mt-2 text-[12px] text-ink/60">
                  {a.routedTo || "Not routed"}
                  {" · lodged "}
                  {new Date(a.createdAt).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })}
                </div>

                {sent && a.issuedFiles.length > 0 && (
                  <div className="mt-1.5 text-[12px] text-seal">
                    Sent back: {a.issuedFiles.join(", ")}
                  </div>
                )}
              </div>

              <div className="flex shrink-0 flex-col gap-2">
                <input
                  ref={(el) => { inputs.current[a.id] = el; }}
                  type="file" accept="application/pdf,.pdf" multiple className="hidden"
                  onChange={(e) => issue(a.id, e.target.files)}
                />
                {!sent && (
                  <button className="btn" disabled={busy === a.id}
                    onClick={() => inputs.current[a.id]?.click()}>
                    {busy === a.id ? "…" : "Send Revised CDC"}
                  </button>
                )}
                {!sent && (
                  <button className="btn-ghost" disabled={busy === a.id} onClick={() => resend(a.id)}>
                    Email It Again
                  </button>
                )}
              </div>
            </div>

            {msg?.id === a.id && (
              <p className={`mt-2 text-[13px] ${msg.good ? "text-seal" : "text-flag"}`}>{msg.text}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
