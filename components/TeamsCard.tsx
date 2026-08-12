"use client";
import { useState } from "react";

interface EventDef { key: string; label: string; detail: string }
interface Config { enabled: boolean; webhook: string; events: Record<string, boolean> }

/** Teams notifications, on a switch. Off until somebody turns it on, and the
 *  switch lives here rather than in an env var so trying it out doesn't need a
 *  redeploy — and neither does turning it off at nine on a Friday night. */
export function TeamsCard({
  initial, events, last,
}: {
  initial: Config;
  events: EventDef[];
  last: { at?: string; ok?: boolean; event?: string; error?: string } | null;
}) {
  const [cfg, setCfg] = useState<Config>(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ good: boolean; text: string } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [open, setOpen] = useState(!initial.enabled && !initial.webhook);

  function edit(patch: Partial<Config>) {
    setCfg((c) => ({ ...c, ...patch }));
    setDirty(true);
    setMsg(null);
  }

  async function post(body: unknown, okText: string) {
    setBusy(true); setMsg(null);
    const r = await fetch("/api/admin/teams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg({ good: false, text: d.error || "That didn't work." }); return false; }
    setMsg({ good: true, text: okText });
    return true;
  }

  async function save() {
    if (await post(cfg, cfg.enabled ? "Saved and switched on." : "Saved. Notifications are off.")) {
      setDirty(false);
    }
  }

  return (
    <div className="card mb-8 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-[12px] font-semibold uppercase tracking-[0.15em] text-ink/70">
            Teams Notifications
          </h2>
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-ink/60">
            Posts a line into a Teams channel when something needs a person —
            a job lodged, a client reply, an enquiry, a certificate that
            couldn&apos;t be delivered. Notifications only: nobody replies from
            Teams, and nothing in the portal reads it. The email and the portal
            are still the record.
          </p>
        </div>
        <button
          onClick={() => edit({ enabled: !cfg.enabled })}
          disabled={busy}
          className={`shrink-0 rounded-md border px-3 py-1.5 text-[13px] transition ${
            cfg.enabled
              ? "border-seal/40 bg-[#EDF3EE] text-seal"
              : "border-rule bg-white text-ink/60 hover:border-seal/50"}`}>
          {cfg.enabled ? "ON" : "OFF"}
        </button>
      </div>

      <label className="mt-4 block">
        <span className="font-display text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/60">
          Webhook URL
        </span>
        <input
          value={cfg.webhook}
          onChange={(e) => edit({ webhook: e.target.value })}
          placeholder="https://…powerplatform.com/…/triggers/manual/paths/invoke?…"
          spellCheck={false}
          className="mt-1 w-full rounded-md border border-rule px-3 py-2 font-mono text-[12px] outline-none focus:border-seal"
        />
      </label>

      <button onClick={() => setOpen((o) => !o)}
        className="mt-2 text-[13px] text-seal underline">
        {open ? "Hide" : "Where do I get one?"}
      </button>
      {open && (
        <ol className="mt-2 space-y-1 rounded-md border border-rule bg-wash px-4 py-3 text-[13px] leading-relaxed text-ink/70">
          <li>1. In Teams, open the channel you want these in.</li>
          <li>2. <strong>⋯</strong> next to the channel name → <strong>Workflows</strong>.</li>
          <li>
            3. Search for <strong>webhook</strong> and choose{" "}
            <strong>&ldquo;Send webhook alerts to a channel&rdquo;</strong>.
          </li>
          <li>4. Next through it, then <strong>Add workflow</strong>.</li>
          <li>5. Copy the URL it gives you and paste it above.</li>
          <li className="pt-1 text-brass">
            Not the ones that say <em>from specific people</em> or{" "}
            <em>from people in an org</em> — those only accept posts from a
            person, and this comes from the portal.
          </li>
          <li className="text-ink/60">
            Microsoft renames these templates from time to time. If the name
            above has moved on, you want any Workflows template whose trigger
            is an incoming webhook posting to a <em>channel</em>. An old
            &ldquo;Incoming Webhook&rdquo; connector URL also still works here.
          </li>
        </ol>
      )}

      <div className="mt-4">
        <p className="font-display text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/60">
          What gets posted
        </p>
        <div className="mt-2 space-y-1.5">
          {events.map((e) => {
            const on = cfg.events[e.key] !== false;
            return (
              <button key={e.key}
                onClick={() => edit({ events: { ...cfg.events, [e.key]: !on } })}
                disabled={busy}
                className="flex w-full items-start gap-2.5 rounded-md border border-transparent px-2 py-1.5 text-left transition hover:border-rule hover:bg-wash">
                <span aria-hidden className={`mt-px shrink-0 font-semibold ${on ? "text-seal" : "text-ink/25"}`}>
                  {on ? "✓" : "○"}
                </span>
                <span className={`text-[13px] ${on ? "text-ink/80" : "text-ink/60"}`}>
                  {e.label}
                  <span className="block text-[12px] text-ink/60">{e.detail}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-rule pt-3">
        <button onClick={save} disabled={busy || !dirty} className="btn-ghost">
          {busy ? "…" : dirty ? "Save" : "Saved"}
        </button>
        {/* A test only means something against what's saved, so the button is
            unavailable until there IS something saved to test — and it says
            which of the two things is missing rather than erroring on click. */}
        <button
          onClick={() => post({ test: true }, "Sent — go and look at the channel.")}
          disabled={busy || dirty || !cfg.enabled}
          className="btn-ghost">
          Send a Test
        </button>
        {dirty ? (
          <span className="text-[12px] text-brass">
            Unsaved changes — press Save, then you can test.
          </span>
        ) : !cfg.enabled ? (
          <span className="text-[12px] text-ink/60">
            Paste a webhook, switch it <strong>ON</strong>, then Save — the test
            sends through whatever is saved.
          </span>
        ) : null}
      </div>

      {msg && (
        <p className={`mt-2 text-[13px] ${msg.good ? "text-seal" : "text-flag"}`}>{msg.text}</p>
      )}

      <p className="mt-2 text-[12px] text-ink/60">
        {last?.at
          ? <>Last notification {new Date(last.at).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}{" "}
              ({last.event}) — {last.ok ? "delivered." : <span className="text-flag">failed: {last.error}</span>}</>
          : "Nothing has been posted yet."}
      </p>
    </div>
  );
}
