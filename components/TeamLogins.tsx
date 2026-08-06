"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

// The company's logins, on My Details. One job: when someone leaves, the
// client disables their login themselves, that day — not after a phone call
// to the office on Monday. Disabling only; re-enabling (and new logins) go
// through the office, because a wrongly disabled teammate is a phone call and
// a wrongly re-enabled departed employee is a breach.

export interface TeamLogin {
  username: string;
  displayName: string;
  lastLoginAt: string | null;
  disabled: boolean;
  you: boolean;
}

const lastSeen = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-AU", {
        timeZone: "Australia/Perth", day: "numeric", month: "short", year: "numeric",
      })
    : "never signed in";

export function TeamLogins({ logins, readonly }: { logins: TeamLogin[]; readonly?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function disable(username: string) {
    if (!confirm(
      `Disable the login "${username}"?\n\n` +
      `They'll lose access to the portal within a minute. Only the CFBA office ` +
      `can re-enable it, so use this when someone has left the company.`
    )) return;
    setBusy(username); setMsg(null);
    try {
      const r = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(d.error || "That didn't work — try again, or ring the office."); return; }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card mb-6 p-5">
      <p className="font-display text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/50">
        Your Team&apos;s Logins
      </p>
      <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-ink/65">
        Everyone at your company who can sign in here. If someone leaves,
        disable their login the day they go — it takes effect within a minute.
        To add a login or bring one back, email the office.
      </p>

      <ul className="mt-3 divide-y divide-rule">
        {logins.map((l) => (
          <li key={l.username} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
            <span className={`font-mono text-[14px] ${l.disabled ? "text-ink/40 line-through" : "text-ink"}`}>
              {l.username}
            </span>
            {l.displayName && (
              <span className={`text-[13px] ${l.disabled ? "text-ink/35" : "text-ink/65"}`}>
                {l.displayName}
              </span>
            )}
            {l.you && <span className="chip">You</span>}
            {l.disabled && <span className="chip">Disabled</span>}
            <span className="ml-auto text-[12px] text-ink/45">
              {l.disabled ? "call us to re-enable" : `last sign-in: ${lastSeen(l.lastLoginAt)}`}
            </span>
            {!l.you && !l.disabled && !readonly && (
              <button
                type="button"
                onClick={() => disable(l.username)}
                disabled={busy !== null}
                className="text-[12px] font-medium text-flag underline underline-offset-2 disabled:opacity-50"
              >
                {busy === l.username ? "Disabling…" : "Disable"}
              </button>
            )}
          </li>
        ))}
      </ul>

      {msg && (
        <p className="mt-3 rounded-sm border-l-[3px] border-flag bg-[#FBECEC] px-3 py-2 text-[13px] text-ink/80">
          {msg}
        </p>
      )}
    </div>
  );
}
