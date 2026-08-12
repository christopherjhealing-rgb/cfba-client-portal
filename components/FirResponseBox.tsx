"use client";
import { useState } from "react";
import { FileBucket, type Bucket } from "./FileBucket";
import { uploadDirect } from "@/lib/upload-client";
import { plannedName } from "@/lib/uploads.mjs";

// The reply box a job wears while it's waiting on the client (at FIR). Unlike
// the ordinary thread reply, files are tagged so the drawings and engineering
// come back as one tidy, dated PDF each — the same naming as a lodgement — so
// the office isn't re-sorting "final_revB (2).pdf" against what it asked for.
// None are required: the client sends whatever was asked, which might be one
// document, or just a message.
const FIR_BUCKETS: Bucket[] = [
  { key: "drawings", label: "Updated Drawings",
    hint: "Site plan and elevations. Combined into one PDF." },
  { key: "engineering", label: "Engineering",
    hint: "Signed, dated structural certification." },
  { key: "other", label: "Other Documents",
    hint: "Anything else we asked for — a BAL report, soil classification. Optional." },
];

export function FirResponseBox({ refNo, address }: { refNo: string; address: string }) {
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<Record<string, File[]>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  const entries = FIR_BUCKETS.flatMap((b) =>
    (files[b.key] || []).map((f) => ({ file: f, category: b.key }))
  );
  const canSend = body.trim().length > 0 || entries.length > 0;
  // The stamp the preview shows is today's; the server stamps the day the
  // reply actually lands, which is the same but for a send across midnight.
  const today = new Date();

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!canSend || busy) return;
    setBusy(true); setMsg(null);

    let r: Response | null = null;
    if (entries.length) {
      const up = await uploadDirect(
        "message",
        entries.map((x) => x.file),
        (done, total) =>
          setProgress(done < total ? `Uploading file ${done + 1} of ${total}…` : "Finishing…")
      );
      setProgress(null);
      if ("error" in up) { setBusy(false); setMsg(up.error); return; }
      if (up.mode === "direct") {
        r = await fetch("/api/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ref: refNo, body, draftId: up.draftId,
            files: entries.map((x, i) => ({ name: up.names[i], category: x.category })),
          }),
        });
      }
    }
    if (!r) {
      // Demo/local fallback, and text-only replies.
      const fd = new FormData();
      fd.set("ref", refNo);
      fd.set("body", body);
      for (const x of entries) {
        fd.append("files", x.file);
        fd.append("fileCategories", x.category);
      }
      r = await fetch("/api/messages", { method: "POST", body: fd });
    }
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) {
      setMsg(d.error || "Something went wrong at our end — please try again, or ring 1300 029 074 and we'll sort it.");
      return;
    }
    setBody(""); setFiles({});
    window.location.reload();
  }

  return (
    <form onSubmit={send} className="border-t border-rule bg-wash p-4">
      <label className="label" htmlFor="fir-reply">Send What We Asked For</label>
      <p className="mb-3 text-[12px] leading-snug text-ink/60">
        Attach the updated documents below, or just reply — whatever we asked for.
        Drawings and engineering are combined into one tidy PDF each, named for
        the site and dated.
      </p>
      <textarea id="fir-reply" rows={3} value={body} onChange={(e) => setBody(e.target.value)}
        className="field resize-y"
        placeholder="Add a note if you like — e.g. the engineer's certificate is attached." />

      <div className="mt-3 space-y-3">
        {FIR_BUCKETS.map((b) => (
          <FileBucket key={b.key} bucket={b} files={files[b.key] || []}
            onChange={(f) => setFiles((prev) => ({ ...prev, [b.key]: f }))}
            combinedAs={plannedName(b.key, address, today)} />
        ))}
      </div>

      {progress && (
        <p className="mt-3 text-[13px] text-ink/60">{progress}</p>
      )}
      <div className="mt-3">
        <button className="btn" disabled={busy || !canSend}>
          {busy ? "Sending…" : "Send to CFBA"}
        </button>
      </div>
      {msg && (
        <p className="mt-3 rounded-sm border-l-[3px] border-flag bg-[#FBECEC] px-3 py-2 text-[13px] text-ink/80">
          {msg}
        </p>
      )}
    </form>
  );
}
