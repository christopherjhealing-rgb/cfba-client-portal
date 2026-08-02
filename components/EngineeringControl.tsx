"use client";
import { useRef, useState } from "react";
import type { EngSet } from "@/lib/engineering";

/** Staff control for the engineering checkers: the client-access switch, the
 *  optional external link, and the checker sets themselves — self-contained
 *  HTML apps uploaded here into private storage, each openable by every
 *  client or restricted to named companies. */
export function EngineeringControl({
  initial, initialSets,
}: {
  initial: { enabled: boolean; url: string };
  initialSets: EngSet[];
}) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [url, setUrl] = useState(initial.url);
  const [sets, setSets] = useState<EngSet[]>(initialSets);
  const [name, setName] = useState("");
  const [clients, setClients] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function save(next: { enabled: boolean; url: string }) {
    setBusy(true); setMsg(null);
    const r = await fetch("/api/admin/engineering", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    setBusy(false);
    if (!r.ok) { const d = await r.json().catch(() => ({})); setMsg(d.error || "Failed."); return; }
    setMsg("Saved.");
  }

  async function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) { setMsg("Choose the checker's .html file first."); return; }
    if (!name.trim()) { setMsg("Give the set a name first."); return; }
    setBusy(true); setMsg(null);
    const fd = new FormData();
    fd.set("file", file); fd.set("name", name); fd.set("clients", clients);
    const r = await fetch("/api/admin/engineering-sets", { method: "POST", body: fd });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg(d.error || "Failed."); return; }
    setSets(d.sets || []);
    setName(""); setClients("");
    if (fileRef.current) fileRef.current.value = "";
    setMsg("Uploaded — it's live for the clients it's open to.");
  }

  async function remove(key: string, setName: string) {
    if (!confirm(`Remove "${setName}"? Clients lose access immediately.`)) return;
    setBusy(true); setMsg(null);
    const r = await fetch("/api/admin/engineering-sets", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg(d.error || "Failed."); return; }
    setSets(d.sets || []);
    setMsg("Removed.");
  }

  return (
    <div className="card mb-8 p-4">
      <h2 className="font-display text-[12px] font-semibold uppercase tracking-[0.15em] text-ink/70">
        Engineering Checkers (Client Access)
      </h2>
      <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-ink/60">
        When on, <strong>Engineering</strong> appears in the client menu and each
        client sees the checker sets they&apos;re allowed. Sets are uploaded below
        into private storage — leave the restriction blank to open a set to every
        client, or list company names (exactly as they appear in Clients,
        comma-separated) to restrict it.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          disabled={busy}
          onClick={() => { const n = !enabled; setEnabled(n); save({ enabled: n, url }); }}
          className={`rounded-md border px-3 py-1.5 text-[13px] ${
            enabled ? "border-seal/40 bg-[#EDF3EE] text-seal" : "border-rule bg-white text-ink/70"}`}>
          Client access: <span className="font-semibold">{enabled ? "ON" : "off"}</span>
        </button>
        <input
          className="field h-9 flex-1 min-w-[220px] py-1 text-[13px]"
          placeholder="External checker URL (optional extra button)"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onBlur={() => save({ enabled, url })}
        />
      </div>

      {sets.length > 0 && (
        <ul className="mt-4 divide-y divide-rule border-t border-rule">
          {sets.map((s) => (
            <li key={s.key} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <div className="min-w-0">
                <a href={`/api/engineering/${encodeURIComponent(s.key)}`} target="_blank"
                  rel="noopener noreferrer" className="text-[13.5px] font-medium text-seal hover:underline">
                  {s.name}
                </a>
                <span className="ml-2 text-[12px] text-ink/45">
                  {s.clients?.length
                    ? `only: ${s.clients.join(", ")}`
                    : "all clients"}
                </span>
              </div>
              <button className="btn-ghost shrink-0" disabled={busy}
                onClick={() => remove(s.key, s.name)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 grid gap-2 border-t border-rule pt-4 sm:grid-cols-2">
        <input className="field h-9 py-1 text-[13px]" placeholder="Set name (e.g. Pure Style P2205 — flat patios)"
          value={name} onChange={(e) => setName(e.target.value)} />
        <input className="field h-9 py-1 text-[13px]" placeholder="Restrict to companies (optional, comma-separated)"
          value={clients} onChange={(e) => setClients(e.target.value)} />
        <input ref={fileRef} type="file" accept=".html,.htm"
          className="text-[13px] file:mr-3 file:rounded-md file:border file:border-rule file:bg-white file:px-3 file:py-1.5 file:text-[12.5px]" />
        <div>
          <button className="btn" disabled={busy} onClick={upload}>
            {busy ? "Working…" : "Upload Checker Set"}
          </button>
        </div>
      </div>

      {msg && <p className="mt-2 text-[13px] text-ink/50">{msg}</p>}
    </div>
  );
}
