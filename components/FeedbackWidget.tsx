"use client";
import { useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";

// The pilot's listening post: a quiet, always-there "Send feedback" that
// captures the moment (page, job, device class) so the office reads reports
// with their context attached. Everything auto-captured is SHOWN before Send
// — nothing rides along silently (DESIGN.md §18 spirit).
const CATEGORIES = [
  { key: "confusing", label: "Something's confusing" },
  { key: "slow", label: "Something's slow" },
  { key: "broken", label: "Something's broken" },
  { key: "idea", label: "An idea" },
  { key: "praise", label: "It worked well" },
] as const;

const uaClass = () =>
  typeof navigator === "undefined" ? "" :
  /Mobi|Android/i.test(navigator.userAgent) ? "mobile" : "desktop";

export function FeedbackWidget({ tone = "client" }: { tone?: "client" | "staff" }) {
  const pathname = usePathname() || "";
  const jobRef = pathname.match(/^\/jobs\/([^/]+)/)?.[1] || null;
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("");
  const [body, setBody] = useState("");
  const [contactOk, setContactOk] = useState(false);
  const [state, setState] = useState<"idle" | "busy" | "sent" | "error">("idle");

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!category || !body.trim() || state === "busy") return;
    setState("busy");
    const r = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category, body: body.trim(), page: pathname, jobRef,
        contactOk, ua: uaClass(),
      }),
    }).catch(() => null);
    if (r?.ok) {
      setState("sent");
      setTimeout(() => { setOpen(false); setState("idle"); setBody(""); setCategory(""); setContactOk(false); }, 1800);
    } else setState("error");
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className={`inline-flex min-h-10 items-center gap-1.5 text-[12.5px] font-medium underline-offset-2 transition hover:underline ${
          tone === "client" ? "text-white/75 hover:text-white" : "text-ink/60 hover:text-seal"}`}>
        Send feedback
      </button>
    );
  }

  // Portal to <body>: the client sidebar is a transformed element (drawer
  // slide), which would otherwise become the containing block for this
  // `fixed` panel and pin it inside the 248px rail instead of the viewport.
  return createPortal(
    <div className="fixed inset-x-3 bottom-3 z-[60] sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-[360px]">
      <form onSubmit={send} className="card border-seal/30 p-4 shadow-lg">
        {state === "sent" ? (
          <p className="py-4 text-center text-[14px] font-medium text-seal-deep">
            Thanks — we read every one.
          </p>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <p className="font-display text-[14px] font-semibold text-ink">Send feedback</p>
              <button type="button" onClick={() => setOpen(false)}
                aria-label="Close feedback" className="grid h-8 w-8 place-items-center rounded-md text-ink/60 hover:bg-wash">✕</button>
            </div>
            <label className="label mt-2" htmlFor="fb-cat">What&apos;s it about?</label>
            <select id="fb-cat" value={category} onChange={(e) => setCategory(e.target.value)}
              className="field py-2 text-[14px]" required>
              <option value="">Pick one…</option>
              {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
            <label className="label mt-3" htmlFor="fb-body">Tell us</label>
            <textarea id="fb-body" rows={3} value={body} maxLength={2000} required
              onChange={(e) => setBody(e.target.value)} className="field resize-y text-[14px]"
              placeholder="A line is plenty — blunt is useful." />
            <label className="mt-2.5 flex cursor-pointer items-center gap-2 text-[12.5px] text-ink/70">
              <input type="checkbox" checked={contactOk} onChange={(e) => setContactOk(e.target.checked)}
                className="h-4 w-4 rounded border-rule accent-[#1E5B3C]" />
              Okay to ring me about this
            </label>
            <p className="mt-2 text-[11.5px] leading-snug text-ink/60">
              Sent with: your login · this page{jobRef ? <> · job {jobRef}</> : null} · {uaClass()}.
            </p>
            {state === "error" && (
              <p className="mt-2 rounded-sm border-l-[3px] border-flag bg-[#FBECEC] px-2.5 py-1.5 text-[12.5px] text-ink/80">
                That didn&apos;t send — try again, or ring 1300 029 074.
              </p>
            )}
            <button className="btn mt-3 w-full" disabled={state === "busy" || !category || !body.trim()}>
              {state === "busy" ? "Sending…" : "Send"}
            </button>
          </>
        )}
      </form>
    </div>,
    document.body
  );
}

/**
 * The pilot's core question, asked at the moment of truth (a success screen),
 * one tap, at most once a fortnight, dismissible forever. Answers land as
 * feedback category "pilot-question".
 */
export function PilotQuestion({ moment }: { moment: string }) {
  const [state, setState] = useState<"show" | "hide" | "thanks">(() => {
    if (typeof window === "undefined") return "hide";
    try {
      if (localStorage.cfbaPQnever) return "hide";
      const last = Number(localStorage.cfbaPQat || 0);
      return Date.now() - last > 14 * 86400000 ? "show" : "hide";
    } catch { return "hide"; }
  });

  async function answer(a: "portal" | "email" | "depends") {
    try { localStorage.cfbaPQat = String(Date.now()); } catch { /* fine */ }
    setState("thanks");
    void fetch("/api/feedback", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: "pilot-question", body: a, page: moment, ua: uaClass() }),
    }).catch(() => {});
  }
  function never() {
    try { localStorage.cfbaPQnever = "1"; } catch { /* fine */ }
    setState("hide");
  }

  if (state === "hide") return null;
  if (state === "thanks") {
    return <p className="mt-4 text-center text-[13px] text-seal-deep">Noted — thank you.</p>;
  }
  return (
    <div className="mt-5 rounded-lg border border-rule bg-wash px-4 py-3 text-center">
      <p className="text-[13.5px] font-medium text-ink">
        Would you rather lodge your next job here, or by email?
      </p>
      <div className="mt-2.5 flex flex-wrap items-center justify-center gap-2">
        <button type="button" onClick={() => answer("portal")} className="btn-ghost">Portal</button>
        <button type="button" onClick={() => answer("email")} className="btn-ghost">Email</button>
        <button type="button" onClick={() => answer("depends")} className="btn-ghost">Depends</button>
      </div>
      <button type="button" onClick={never}
        className="mt-2 text-[11.5px] text-ink/60 underline underline-offset-2 hover:text-ink">
        Don&apos;t ask again
      </button>
    </div>
  );
}
