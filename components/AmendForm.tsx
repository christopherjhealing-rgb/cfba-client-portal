"use client";
import { useState } from "react";
import { uploadDirect } from "@/lib/upload-client";

export interface AmendableJob {
  ref: string;
  address: string;
  description: string;
  status: string;
  issued: boolean;
}

export function AmendForm({ jobs, preselect }: { jobs: AmendableJob[]; preselect?: string }) {
  const pre = preselect && jobs.find((j) => j.ref === preselect);
  const [query, setQuery] = useState(pre ? `${pre.ref} — ${pre.address}` : "");
  const [ref, setRef] = useState(pre ? pre.ref : "");
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [instant, setInstant] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const job = jobs.find((j) => j.ref === ref);

  // Some clients have hundreds of jobs, so this is a text field that filters as
  // you type rather than a dropdown. Anything typed is accepted — if it doesn't
  // resolve to a job we know, the office links it at review.
  const q = query.trim().toLowerCase();
  const matches = q.length < 2 ? [] : jobs.filter((j) =>
    j.ref.toLowerCase().includes(q) || j.address.toLowerCase().includes(q)
  ).slice(0, 8);

  function choose(j: AmendableJob) {
    setRef(j.ref);
    setQuery(`${j.ref} — ${j.address}`);
    setOpen(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);

    // Revised drawings go straight to storage via signed URLs when they exist;
    // the multipart path stays for demo mode and file-less amendments.
    let up: Awaited<ReturnType<typeof uploadDirect>> = { mode: "inline" };
    if (files.length) up = await uploadDirect("submission", files);
    if ("error" in up) { setBusy(false); setMsg(up.error); return; }

    let r: Response;
    if (files.length && up.mode === "direct") {
      r = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amendmentOf: ref,
          address: job?.address || query.trim(),
          jobClass: "Amendment",
          description,
          notes,
          draftId: up.draftId,
          files: up.names.map((name) => ({ name })),
        }),
      });
    } else {
      const fd = new FormData();
      fd.set("amendmentOf", ref);
      fd.set("address", job?.address || query.trim());
      if (!ref) fd.set("originalJobText", query.trim());
      fd.set("jobClass", "Amendment");
      fd.set("description", description);
      fd.set("notes", notes);
      for (const f of files) fd.append("files", f);
      r = await fetch("/api/submit", { method: "POST", body: fd });
    }
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg(d.error || "Something went wrong."); return; }
    setInstant(!!d.accepted);
    setDone(true);
  }

  if (done) {
    return (
      <div className="card p-8 text-center">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-seal/10 text-seal">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
        </div>
        <h2 className="font-display text-[21px] font-semibold">Amendment sent</h2>
        <p className="mx-auto mt-2 max-w-md text-[14px] leading-relaxed text-ink/65">
          {instant ? (
            <>It&apos;s been opened as a new job{ref ? ` linked to ${ref}` : ""} and will
            appear in your job list shortly. The original job stays exactly as it is.
            We&apos;ll reply to the email address on your account.</>
          ) : (
            <>The office will open it as a new job{ref ? ` linked to ${ref}` : ""}, and it
            will appear in your job list once accepted. The original job stays exactly
            as it is. We&apos;ll reply to the email address on your account.</>
          )}
        </p>
        <a href="/jobs" className="btn mt-6">Back to my jobs</a>
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="card px-6 py-10 text-center">
        <p className="font-display text-[16px] font-semibold">Nothing to amend yet</p>
        <p className="mx-auto mt-1 max-w-sm text-[13px] text-ink/55">
          Once you have a job with us, you can request a change to it here.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card p-6">
      <label className="label" htmlFor="job">Which job is changing?</label>
      <div className="relative">
        <input id="job" required autoComplete="off" value={query}
          onChange={(e) => { setQuery(e.target.value); setRef(""); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          className="field"
          placeholder="Start typing the job number or address…" />
        {open && matches.length > 0 && (
          <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-rule bg-white shadow-lg">
            {matches.map((j) => (
              <li key={j.ref}>
                <button type="button" onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(j)}
                  className="flex w-full items-baseline gap-2 px-3 py-2.5 text-left transition hover:bg-wash">
                  <span className="font-mono text-[12px] text-ink/45">{j.ref}</span>
                  <span className="min-w-0 flex-1 truncate text-[14px]">{j.address}</span>
                  {j.issued && <span className="chip chip-seal shrink-0">Issued</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="mt-1.5 text-[12px] text-ink/50">
        {ref
          ? `Linked to job ${ref}.`
          : query.trim()
            ? "We couldn't match that to a job automatically — the office will link it when they review."
            : "Type a few characters of the job number or the address."}
      </p>

      {job?.issued && (
        <p className="mt-3 rounded-sm border-l-[3px] border-brass bg-[#FBF6EA] px-3 py-2.5 text-[13px] leading-relaxed text-ink/75">
          This job has already been certified. The certificate covers the plans it was
          issued against, so an amendment needs a fresh assessment and will be
          certified separately. Don&apos;t build to the change until that&apos;s done.
        </p>
      )}

      <label className="label mt-5" htmlFor="what">What&apos;s changing?</label>
      <input id="what" required value={description} onChange={(e) => setDescription(e.target.value)}
        className="field" placeholder="e.g. Patio extended by 1.2 m to the north" />

      <label className="label mt-5" htmlFor="notes">Anything else we should know</label>
      <textarea id="notes" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)}
        className="field resize-y"
        placeholder="Why it changed, whether anything has been built yet, and anything the surveyor should look at first." />

      <label className="label mt-5" htmlFor="files">Revised drawings</label>
      <input id="files" type="file" multiple
        onChange={(e) => setFiles(Array.from(e.target.files || []))}
        className="field file:mr-3 file:rounded file:border-0 file:bg-wash file:px-3 file:py-1.5 file:text-[13px]" />
      <p className="mt-1.5 text-[12px] text-ink/50">
        Send the amended plans, and the engineering if it changed too. Up to 40 MB.
      </p>

      <button className="btn mt-6 w-full" disabled={busy || !query.trim()}>
        {busy ? "Sending…" : "Request the amendment"}
      </button>

      {msg && (
        <p className="mt-4 rounded-sm border-l-[3px] border-flag bg-[#FBECEC] px-3 py-2 text-[13px] text-ink/80">
          {msg}
        </p>
      )}
    </form>
  );
}
