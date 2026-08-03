"use client";
import { useRef, useState } from "react";
import { uploadDirect } from "@/lib/upload-client";

/**
 * The guide attached to every new client's login email.
 *
 * It describes the portal, so it goes out of date every time the portal
 * changes — which is why it's replaceable from here rather than only in a
 * deploy. Removing the replacement falls back to the copy that ships with the
 * build; there is always a guide.
 */
export function WelcomeGuideCard({ overridden }: { overridden: boolean }) {
  const [custom, setCustom] = useState(overridden);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ good: boolean; text: string } | null>(null);
  const input = useRef<HTMLInputElement | null>(null);

  async function post(body: unknown, ok: string, nextCustom: boolean) {
    setBusy(true); setMsg(null);
    const r = await fetch("/api/admin/info-sheets", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg({ good: false, text: d.error || "That didn't work." }); return; }
    setCustom(nextCustom);
    setMsg({ good: true, text: ok });
  }

  async function replace(file: File | undefined) {
    if (!file) return;
    if (!/\.pdf$/i.test(file.name)) { setMsg({ good: false, text: "PDFs only." }); return; }
    setBusy(true); setMsg(null);
    const up = await uploadDirect("infosheet", [file]);
    if ("error" in up) { setBusy(false); setMsg({ good: false, text: up.error }); return; }
    if (up.mode === "inline") {
      setBusy(false); setMsg({ good: false, text: "Not available in demo mode." }); return;
    }
    setBusy(false);
    await post({ key: "__guide", draftId: up.draftId, name: up.names[0] },
      "Replaced. New clients get this one from now on.", true);
  }

  return (
    <div className="card mb-8 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-[12px] font-semibold uppercase tracking-[0.15em] text-ink/70">
            Welcome Guide
          </h2>
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-ink/60">
            Attached to the email a new client gets with their username and
            setup code. It explains the portal, so it dates every time the
            portal changes — replace it here rather than waiting on a deploy.
          </p>
        </div>
        <span className={`chip shrink-0 ${custom ? "chip-seal" : ""}`}>
          {custom ? "Replaced" : "Shipped version"}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-rule pt-3">
        <a href="/guides/getting-started.pdf" target="_blank" rel="noreferrer" className="btn-ghost">
          See the Shipped One
        </a>
        <input ref={input} type="file" accept="application/pdf,.pdf" className="hidden"
          onChange={(e) => replace(e.target.files?.[0])} />
        <button className="btn-ghost" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? "…" : custom ? "Replace Again" : "Replace It"}
        </button>
        {custom && (
          <button className="btn-ghost" disabled={busy}
            onClick={() => post({ key: "__guide", revert: true }, "Back to the shipped guide.", false)}>
            Use the Shipped One
          </button>
        )}
      </div>
      {msg && <p className={`mt-2 text-[13px] ${msg.good ? "text-seal" : "text-flag"}`}>{msg.text}</p>}
    </div>
  );
}
