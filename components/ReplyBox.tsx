"use client";
import { useRef, useState } from "react";
import { Icon } from "./Icon";

const MAX_MB = 25;

export function ReplyBox({ refNo }: { refNo: string }) {
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const totalMb = files.reduce((n, f) => n + f.size, 0) / 1_048_576;
  const tooBig = totalMb > MAX_MB;
  const canSend = (body.trim().length > 0 || files.length > 0) && !tooBig;

  function add(list: FileList | null) {
    if (!list) return;
    const incoming = Array.from(list).filter((f) => /\.pdf$/i.test(f.name));
    if (incoming.length < list.length) {
      setMsg("PDFs only. Anything else needs to be converted or emailed to the office.");
    }
    setFiles((prev) => {
      const names = new Set(prev.map((f) => f.name));
      return [...prev, ...incoming.filter((f) => !names.has(f.name))];
    });
    if (input.current) input.current.value = "";
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!canSend) return;
    setBusy(true); setMsg(null);
    const fd = new FormData();
    fd.set("ref", refNo);
    fd.set("body", body);
    for (const f of files) fd.append("files", f);
    const r = await fetch("/api/messages", { method: "POST", body: fd });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg(d.error || "Something went wrong."); return; }
    setBody(""); setFiles([]);
    window.location.reload();
  }

  return (
    <form onSubmit={send} className="border-t border-rule bg-wash p-4">
      <label className="label" htmlFor="reply">Reply</label>
      <textarea id="reply" rows={4} value={body} onChange={(e) => setBody(e.target.value)}
        className="field resize-y"
        placeholder="Type your message. It goes straight onto the job — no email needed." />

      <input ref={input} type="file" multiple accept="application/pdf,.pdf" className="hidden"
        onChange={(e) => add(e.target.files)} />

      {files.length > 0 && (
        <ul className="mt-3 space-y-1 rounded-lg border border-rule bg-white px-3 py-2.5">
          {files.map((f, i) => (
            <li key={f.name} className="flex items-center gap-2 text-[13px] text-ink/75">
              <span className="text-seal"><Icon name="check" size={13} /></span>
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
              <span className="shrink-0 font-mono text-[11px] text-ink/40">
                {(f.size / 1_048_576).toFixed(1)} MB
              </span>
              <button type="button" aria-label={`Remove ${f.name}`}
                onClick={() => setFiles(files.filter((_, n) => n !== i))}
                className="shrink-0 rounded p-1 text-ink/35 transition hover:bg-wash hover:text-flag">
                <Icon name="close" size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button className="btn" disabled={busy || !canSend}>
          {busy ? "Sending…" : "Send message"}
        </button>
        <button type="button" onClick={() => input.current?.click()} className="btn-ghost">
          <Icon name="plus" size={13} /> Attach files
        </button>
        <span className={`text-[12px] ${tooBig ? "font-medium text-flag" : "text-ink/50"}`}>
          {files.length
            ? `${files.length} file${files.length === 1 ? "" : "s"}, ${totalMb.toFixed(1)} MB of ${MAX_MB} MB`
            : `Attach PDFs — drawings, engineering or certificates, up to ${MAX_MB} MB.`}
        </span>
      </div>

      {tooBig && (
        <p className="mt-3 rounded-sm border-l-[3px] border-flag bg-[#FBECEC] px-3 py-2 text-[13px] text-ink/80">
          That&apos;s over {MAX_MB} MB. Remove the largest file and email it to the
          office quoting {refNo}.
        </p>
      )}
      {msg && (
        <p className="mt-3 rounded-sm border-l-[3px] border-flag bg-[#FBECEC] px-3 py-2 text-[13px] text-ink/80">
          {msg}
        </p>
      )}
    </form>
  );
}
