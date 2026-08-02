"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon, type IconName } from "./Icon";
import {
  newsSince, sanitiseSeen, sanitiseSnapshot, seenKey,
  type NewsEvent, type Seen,
} from "@/lib/notify.mjs";

// ---------------------------------------------------------------------------
// Live notifications while a client has the portal open.
//
// Polling, not push. This runs on Vercel, where a connection held open all
// day costs real money and buys nothing at this scale — a builder wants to
// know within the minute, not within the second.
//
// Everything here is written to be considerate of a phone on a site: the
// timer stops dead when the tab isn't visible and picks up with an immediate
// check when they come back, repeated failures back off instead of hammering
// a store that's already struggling, and every failure is silent. A
// notification system that throws errors at a client is worse than none.
// ---------------------------------------------------------------------------

/** Between checks while the tab is in front of the client. */
const POLL_MS = 50_000;
/** After landing on a page. The page itself is fresh; there's nothing to
 *  learn in the first few seconds, and a client clicking quickly through the
 *  menu shouldn't fire a request per click. */
const SETTLE_MS = 5_000;
/** Ceiling on the back-off. Ten minutes of quiet, then try again. */
const MAX_BACKOFF_MS = 10 * 60_000;
/** How long a card stands before it bows out. The lasting signals — the
 *  Messages badge, the Downloads page — are still there afterwards, so a
 *  card that outstays its welcome only gets in the way. */
const TOAST_MS = 30_000;

/** When this document last asked. Module scope on purpose: moving between
 *  pages remounts this component, and without it every navigation would
 *  start the clock again. */
let lastCheckAt = 0;

interface Toast {
  id: string;
  icon: IconName;
  title: string;
  ref?: string;
  detail: string;
  href: string;
  cta: string;
}

function toastFor(e: NewsEvent): Toast {
  if (e.kind === "ready") {
    return {
      id: `ready:${e.ref}`,
      icon: "download",
      title: "Your CDC Package Is Ready",
      ref: e.ref,
      detail: `${e.address} has been issued and is ready to download.`,
      href: `/jobs/${encodeURIComponent(e.ref)}`,
      cta: "Open the Job",
    };
  }
  return {
    id: "message",
    icon: "mail",
    title: "A Message From Us",
    detail: e.unread > 1
      ? `${e.unread} of your jobs have messages waiting for you.`
      : "We've just sent you a message about one of your jobs.",
    href: "/messages",
    cta: "Read It Now",
  };
}

/** Fold new events into what's already on screen. Only ever one message card
 *  standing — a second arrival updates the count rather than stacking. */
function merge(current: Toast[], events: NewsEvent[]): Toast[] {
  const next = [...current];
  for (const e of events) {
    const t = toastFor(e);
    const at = next.findIndex((x) => x.id === t.id);
    if (at >= 0) next[at] = t;
    else next.push(t);
  }
  return next.slice(-4);
}

export function Notifications({
  company,
  onUnread,
}: {
  /** Names the record of what this browser has already been told, so two
      clients sharing a computer never inherit each other's news. */
  company: string;
  /** Hands the live unread count back to the shell, for the sidebar badge. */
  onUnread: (n: number) => void;
}) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const key = seenKey(company);
    let seen: Seen | null = null;
    try {
      seen = sanitiseSeen(JSON.parse(localStorage.getItem(key) || "null"));
    } catch {
      /* nothing readable there — the first check writes a fresh record */
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    let fails = 0;

    const later = (ms: number) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(check, ms);
    };

    async function check() {
      timer = null;
      // Hidden tab: don't spend the client's battery or their data. The
      // visibility handler starts things again the moment they come back.
      if (stopped || document.visibilityState !== "visible") return;
      lastCheckAt = Date.now();

      let snap = null;
      try {
        const r = await fetch("/api/notifications", {
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        // Signed out or signed in as somebody else — stop for good rather
        // than knocking on a door that isn't ours.
        if (r.status === 401 || r.status === 403) {
          stopped = true;
          return;
        }
        if (r.ok) snap = sanitiseSnapshot(await r.json());
      } catch {
        /* offline, a dropped connection, a gateway having a moment — all
           the same thing from here, and none of it is the client's problem */
      }
      if (stopped) return;

      if (!snap) {
        fails += 1;
        later(Math.min(POLL_MS * 2 ** fails, MAX_BACKOFF_MS));
        return;
      }

      fails = 0;
      const news = newsSince(seen, snap);
      seen = news.seen;
      try {
        localStorage.setItem(key, JSON.stringify(seen));
      } catch {
        /* private mode or a full disk. Worst case the client hears about
           something twice — better than being told about nothing. */
      }
      onUnread(snap.unread);
      if (news.events.length) setToasts((cur) => merge(cur, news.events));
      later(POLL_MS);
    }

    function onVisibility() {
      if (stopped) return;
      if (document.visibilityState === "visible") {
        fails = 0;
        later(0); // they're back — find out what they missed straight away
      } else if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    }

    const since = Date.now() - lastCheckAt;
    later(lastCheckAt ? Math.max(SETTLE_MS, POLL_MS - since) : SETTLE_MS);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [company, onUnread]);

  const dismiss = (id: string) => setToasts((cur) => cur.filter((t) => t.id !== id));

  return (
    <>
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          .cfba-toast { animation: cfba-toast-in 0.28s ease both; }
          @keyframes cfba-toast-in { from { opacity: 0; transform: translateY(12px); } }
        }
      `}</style>
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2.5 px-4 pb-4 sm:inset-x-auto sm:bottom-5 sm:right-5 sm:items-end sm:px-0"
      >
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </>
  );
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, TOAST_MS);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div className="cfba-toast card pointer-events-auto w-full max-w-[380px] p-4 shadow-[0_12px_32px_-12px_rgba(16,26,21,0.4)]">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#E7F0EA] text-seal">
          <Icon name={toast.icon} size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-display text-[13px] font-semibold text-ink">{toast.title}</div>
          <p className="mt-1 text-[13px] leading-relaxed text-ink/65">
            {toast.ref && (
              <span className="mr-1.5 font-mono text-[12px] text-ink/50">{toast.ref}</span>
            )}
            {toast.detail}
          </p>
          <Link
            href={toast.href}
            onClick={onDismiss}
            className="mt-2 inline-flex items-center gap-1.5 font-display text-[12px] font-semibold uppercase tracking-[0.08em] text-seal underline-offset-2 hover:underline"
          >
            {toast.cta}
            <Icon name="arrowRight" size={13} />
          </Link>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="-mr-1 -mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-md text-ink/35 transition hover:bg-wash hover:text-ink/70"
        >
          <Icon name="close" size={14} />
        </button>
      </div>
    </div>
  );
}
