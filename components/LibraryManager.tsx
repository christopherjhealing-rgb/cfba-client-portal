"use client";
import { useRef, useState } from "react";
import { Icon } from "./Icon";
import { fmtDate } from "./JobBits";
import type { LibraryDoc } from "@/lib/library";

/** My documents — the client's own library of reusable engineering PDFs.
 *  Save once here, tick on at lodgement. Lives on the My details page. */
export function LibraryManager({ initial }: { initial: LibraryDoc[] }) {
  const [docs, setDocs] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameTo, setRenameTo] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [label, setLabel] = useState("");
  const input = useRef<HTMLInputElement>(null);

  async function call(init: RequestInit): Promise<boolean> {
    setBusy(true); setMsg(null);
    const r = await fetch("/api/library", init).catch(() => null);
    const d = await r?.json().catch(() => ({}));
    setBusy(false);
    if (!r || !r.ok) {
      setMsg(d?.error || "Something went wrong at our end — please try again, or ring 1300 029 074 and we'll sort it.");
      return false;
    }
    setDocs(d.docs || []);
    return true;
  }

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    fd.set("label", label);
    if (await call({ method: "POST", body: fd })) {
      setFile(null); setLabel("");
      if (input.current) input.current.value = "";
    }
  }

  async function rename(id: string) {
    if (await call({
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, label: renameTo }),
    })) setRenaming(null);
  }

  async function remove(d: LibraryDoc) {
    if (!confirm(`Delete "${d.label}" from your documents? Jobs you've already lodged with it keep their copy.`)) return;
    await call({
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: d.id }),
    });
  }

  return (
    <div className="card mb-6 p-5">
      <p className="font-display text-[14px] font-semibold text-ink">My documents</p>
      <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-ink/65">
        Engineering you lodge again and again — standard patio details, shed
        certification. Save it here once, and when you lodge a job it&apos;s a
        single tick instead of a hunt through your files.
      </p>

      {docs.length > 0 && (
        <ul className="mt-4 divide-y divide-rule border-t border-rule">
          {docs.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
              {renaming === d.id ? (
                <>
                  <input autoFocus value={renameTo} maxLength={80}
                    onChange={(e) => setRenameTo(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); rename(d.id); } }}
                    className="field min-w-0 flex-1 py-1.5 text-[13px]" />
                  <button type="button" className="btn-ghost shrink-0 px-3 py-1.5"
                    disabled={busy || !renameTo.trim()} onClick={() => rename(d.id)}>Save</button>
                  <button type="button" className="btn-ghost shrink-0 px-3 py-1.5"
                    disabled={busy} onClick={() => setRenaming(null)}>Cancel</button>
                </>
              ) : (
                <>
                  <span className="text-seal"><Icon name="folder" size={14} /></span>
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-ink">
                    {d.label}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-ink/40">
                    {(d.size / 1048576).toFixed(1)} MB · {fmtDate(d.uploadedAt)}
                  </span>
                  <span className="flex shrink-0 gap-2">
                    <button type="button" className="btn-ghost px-3 py-1.5" disabled={busy}
                      onClick={() => { setRenaming(d.id); setRenameTo(d.label); }}>Rename</button>
                    <button type="button" className="btn-ghost px-3 py-1.5" disabled={busy}
                      onClick={() => remove(d)}>Delete</button>
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={upload}
        className={`mt-4 rounded-lg border border-rule bg-wash p-3.5 ${docs.length ? "" : "border-dashed"}`}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1">
            <label className="label" htmlFor="doc-label">Name it</label>
            <input id="doc-label" value={label} maxLength={80}
              onChange={(e) => setLabel(e.target.value)} className="field py-2 text-[14px]"
              placeholder="e.g. Standard patio engineering" />
          </div>
          <input ref={input} type="file" accept="application/pdf,.pdf" className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] || null)} />
          <button type="button" className="btn-ghost" disabled={busy}
            onClick={() => input.current?.click()}>
            {file ? "Change PDF" : "Choose PDF"}
          </button>
          <button className="btn" disabled={busy || !file}>
            {busy ? "Saving…" : "Save document"}
          </button>
        </div>
        {file && (
          <p className="mt-2 text-[12px] text-ink/55">
            {file.name} — {(file.size / 1048576).toFixed(1)} MB. PDF only, up to 25 MB.
          </p>
        )}
      </form>

      {msg && (
        <p className="mt-3 rounded-sm border-l-[3px] border-flag bg-[#FBECEC] px-3 py-2 text-[13px] text-ink/80">
          {msg}
        </p>
      )}
    </div>
  );
}
