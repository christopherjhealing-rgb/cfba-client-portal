"use client";
import { useState } from "react";

/**
 * The address every emailed link points at.
 *
 * It gets its own card rather than a row in the health list because it is the
 * one setting that can be wrong without anything looking wrong — no error, no
 * failed build, just a button in a client's inbox that goes nowhere. It has
 * to be changeable in ten seconds, from a phone, by whoever notices.
 */
export function AppUrlCard({
  live, stored, fallback,
}: {
  /** What links are using right now. */
  live: string;
  /** The override, if one is set. Empty means the deployment's own value. */
  stored: string;
  /** What it falls back to with no override — i.e. APP_URL or the Vercel URL. */
  fallback: string;
}) {
  const [url, setUrl] = useState(stored);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [now, setNow] = useState(live);

  async function save(next: string) {
    setBusy(true); setMsg(null);
    const r = await fetch("/api/admin/app-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: next }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg(d.error || "That didn't save."); return; }
    setNow(d.url);
    setUrl(d.stored);
    setMsg(d.stored
      ? "Saved. Every email from now on uses this address."
      : "Cleared. Links now use the address this deployment was given.");
  }

  const dead = /localhost|127\.0\.0\.1/.test(now);

  return (
    <div className="card p-5">
      <p className="font-display text-[13px] font-semibold">Portal Address</p>
      <p className="mt-1 text-[13px] leading-relaxed text-ink/65">
        Every link the portal emails hangs off this — the login invitation,
        &ldquo;your package is ready&rdquo;, the request for more information.
        It&apos;s the only setting that can be wrong without anything looking
        wrong, so it&apos;s changeable here as well as in the deployment.
      </p>

      <div className="mt-3 rounded-lg border border-rule bg-wash px-4 py-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink/50">
          Links are using
        </p>
        <p className={`mt-0.5 break-all font-mono text-[13px] ${dead ? "text-flag" : "text-ink"}`}>
          {now}
        </p>
        {!stored && (
          <p className="mt-1 text-[12px] text-ink/55">
            No override set — this is what the deployment was given.
          </p>
        )}
      </div>

      <label className="label mt-4" htmlFor="appurl">Use this address instead</label>
      <input id="appurl" value={url} onChange={(e) => setUrl(e.target.value)}
        className="field font-mono text-[13px]" placeholder={fallback}
        inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
      <p className="mt-1.5 text-[12px] text-ink/50">
        Leave it blank to go back to the deployment&apos;s own address. No
        trailing slash — it&apos;s added where it&apos;s needed.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn" disabled={busy || url.trim() === stored}
          onClick={() => save(url)}>
          {busy ? "Saving…" : "Save"}
        </button>
        {stored && (
          <button className="btn-ghost" disabled={busy} onClick={() => save("")}>
            Clear the override
          </button>
        )}
      </div>

      {msg && (
        <p className="mt-3 rounded-sm border-l-[3px] border-seal bg-wash px-3 py-2 text-[13px] text-ink/80">
          {msg}
        </p>
      )}

      <p className="mt-3 border-t border-rule pt-3 text-[12px] leading-relaxed text-ink/55">
        Emails already sent keep the address they were sent with — this only
        changes what goes out from now on.
      </p>
    </div>
  );
}
