"use client";
import { useState } from "react";
import { Icon } from "./Icon";

// Matches MAX_REASON on the route. The counter only appears near the limit —
// a character count hovering over someone explaining themselves is off-putting.
const MAX = 600;

/**
 * Cancelling a job, as a quiet way out rather than a button competing with
 * Download. Two steps on purpose: the link opens a panel that asks why, and
 * nothing is sent until there's an answer in it.
 *
 * Only rendered for jobs that can still be cancelled — see canCancel in
 * core.mjs. The route checks the same rule again; this is the courtesy, not
 * the control.
 */
export function CancelJob({ refNo }: { refNo: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const text = reason.trim();
  const left = MAX - reason.length;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/jobs/${encodeURIComponent(refNo)}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: text }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setError(d.error || "That didn't go through. Ring us on 1300 029 074 and we'll sort it.");
        setBusy(false);
        return;
      }
      window.location.reload();
    } catch {
      setError("We couldn't reach the server just then — check your connection and try again.");
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <p className="mt-6 text-center text-[13px] text-ink/50">
        Need to stop this job?{" "}
        <button type="button" onClick={() => setOpen(true)}
          className="font-medium text-ink/65 underline underline-offset-2 transition hover:text-flag">
          Cancel it
        </button>
      </p>
    );
  }

  return (
    <form onSubmit={send} className="mt-6 rounded-xl border border-rule bg-wash p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-brass-deep">
          <Icon name="alert" size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[15px] font-semibold text-ink">
            Cancel this job?
          </p>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink/70">
            Tell us what&apos;s changed and we&apos;ll stop work on it. Your
            surveyor sees this straight away, and we&apos;ll mark the job
            cancelled on our board.
          </p>

          <label className="label mt-4" htmlFor="cancel-reason">
            Why are you cancelling?
          </label>
          <textarea id="cancel-reason" rows={3} required maxLength={MAX}
            value={reason} onChange={(e) => setReason(e.target.value)}
            className="field resize-y"
            placeholder="For example: the owner has put it on hold, or the design has changed and we'll lodge it again." />
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[12px] text-ink/50">
              A line is plenty — it goes straight onto the job.
            </span>
            {left <= 100 && (
              <span className={`text-[12px] ${left <= 0 ? "font-medium text-flag" : "text-ink/50"}`}>
                {left} left
              </span>
            )}
          </div>

          <p className="mt-3.5 rounded-lg border border-brass/40 bg-[#FBF4E6] px-3.5 py-2.5 text-[13px] leading-relaxed text-brass-deep">
            You can&apos;t undo this from the portal. Changed your mind, or not
            quite sure? Ring us on{" "}
            <a href="tel:1300029074" className="font-semibold underline underline-offset-2">1300 029 074</a>{" "}
            — we&apos;d much rather talk it through than have you cancel
            something you needed.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            <button type="submit" disabled={busy || !text}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-flag px-4 py-2.5 font-display text-[12px] font-semibold uppercase tracking-[0.08em] text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45">
              {busy ? "Cancelling…" : "Yes, cancel this job"}
            </button>
            <button type="button" onClick={() => { setOpen(false); setError(null); }}
              disabled={busy} className="btn-ghost">
              Keep it open
            </button>
          </div>

          {error && (
            <p className="mt-3 rounded-sm border-l-[3px] border-flag bg-[#FBECEC] px-3 py-2 text-[13px] text-ink/80">
              {error}
            </p>
          )}
        </div>
      </div>
    </form>
  );
}
