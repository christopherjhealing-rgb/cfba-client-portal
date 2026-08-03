"use client";
import { useEffect, useState } from "react";
import { uploadDirect } from "@/lib/upload-client";

export interface AmendableJob {
  ref: string;
  address: string;
  description: string;
  status: string;
  issued: boolean;
  /** From the past-jobs index — a job we've finished, not current work. */
  past?: boolean;
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

  // Our reference, for a job the portal doesn't hold. Only jobs still in
  // progress are synced here, so anything we've completed — which is most of
  // what a client has ever had from us — can't be picked from the list above
  // and has to be looked up.
  const [oldRef, setOldRef] = useState("");
  const [found, setFound] =
    useState<{ ref: string; address: string; historic: boolean } | null>(null);
  const [looking, setLooking] = useState(false);

  const job = jobs.find((j) => j.ref === ref);
  // What the form will actually lodge against.
  const target = ref || found?.ref || "";

  // Some clients have hundreds of jobs, so this is a text field that filters as
  // you type rather than a dropdown. It searches everything we've ever done
  // for them — see the past-jobs index in lib/history.
  const q = query.trim().toLowerCase();
  const matches = q.length < 2 ? [] : jobs.filter((j) =>
    j.ref.toLowerCase().includes(q) || j.address.toLowerCase().includes(q)
  ).slice(0, 8);

  function choose(j: AmendableJob) {
    setRef(j.ref);
    setQuery(j.address);
    setOldRef(j.ref);
    setOpen(false);
  }

  /** Typing over the reference means they're identifying the job that way, so
   *  the picked job is released — otherwise the form would keep lodging
   *  against the old one while showing a different number. */
  function editRef(v: string) {
    setOldRef(v);
    if (ref) { setRef(""); setQuery(""); }
  }

  // Checked as they type, so they find out the reference is good BEFORE
  // filling the rest in — not after pressing Lodge. Debounced because every
  // miss costs a query against the board.
  useEffect(() => {
    const q = oldRef.trim();
    setFound(null);
    if (ref || q.replace(/[\s\-\/._#]/g, "").length < 3) { setLooking(false); return; }
    setLooking(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/jobs/lookup?ref=${encodeURIComponent(q)}`);
        const d = await r.json().catch(() => ({}));
        setFound(d?.found ? d : null);
      } catch { setFound(null); }
      setLooking(false);
    }, 450);
    return () => clearTimeout(t);
  }, [oldRef, ref]);

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
          amendmentOf: target,
          address: job?.address || found?.address || query.trim(),
          jobClass: "Amendment",
          description,
          notes,
          draftId: up.draftId,
          files: up.names.map((name) => ({ name })),
        }),
      });
    } else {
      const fd = new FormData();
      fd.set("amendmentOf", target);
      fd.set("address", job?.address || found?.address || query.trim());
      fd.set("jobClass", "Amendment");
      fd.set("description", description);
      fd.set("notes", notes);
      for (const f of files) fd.append("files", f);
      r = await fetch("/api/submit", { method: "POST", body: fd });
    }
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg(d.error || "Something went wrong at our end — please try again, or ring 1300 029 074 and we'll sort it."); return; }
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
        <h2 className="font-display text-[21px] font-semibold">Amendment Sent</h2>
        <p className="mx-auto mt-2 max-w-md text-[14px] leading-relaxed text-ink/65">
          It&apos;s with your building surveyor now, along with the documents you
          sent. They&apos;ll confirm the change is acceptable, then we&apos;ll
          re-issue the certificate and email you when it&apos;s ready to download.
          Your original certificate stays valid until that happens — don&apos;t
          build to the change before then.
        </p>
        <a href="/jobs" className="btn mt-6">Back to My Jobs</a>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card p-6">
      <label className="label" htmlFor="job">Which job is changing?</label>
      <div className="relative">
        <input id="job" required autoComplete="off" value={query}
          onChange={(e) => { setQuery(e.target.value); if (ref) { setRef(""); setOldRef(""); } setOpen(true); }}
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
                  <span className="font-mono text-[12px] text-ink/55">{j.ref}</span>
                  <span className="min-w-0 flex-1 truncate text-[14px]">{j.address}</span>
                  {j.past
                    ? <span className="chip shrink-0">Completed</span>
                    : j.issued && <span className="chip chip-seal shrink-0">Issued</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="mt-1.5 text-[12px] text-ink/50">
        {ref
          ? `Linked to job ${ref}.`
          : "Every job you've had with us, completed ones included. Type the address or our reference."}
      </p>

      {/* Only jobs still in progress are in the portal. Everything we've
          finished — which for most clients is nearly everything they've ever
          had from us — has to be found by its reference. Checked as they type
          so nobody discovers it was wrong after filling the whole form in. */}
      <div className="mt-4">
        <label className="label" htmlFor="oldRef">Our reference</label>
        <input
          id="oldRef" value={oldRef} autoComplete="off" spellCheck={false}
          onChange={(e) => editRef(e.target.value)}
          className="field font-mono text-[13px]" placeholder="e.g. 51205 or BA2025094" />
        <p className="mt-1.5 text-[12px] leading-relaxed">
          {ref ? (
            <span className="text-seal">
              Matches the job above. This is the reference we&apos;ll amend.
            </span>
          ) : looking ? (
            <span className="text-ink/45">Checking…</span>
          ) : found ? (
            <span className="text-seal">
              Found — <strong>{found.ref}</strong>
              {found.address ? `, ${found.address}` : ""}.
              {found.historic ? " A completed job." : ""}
            </span>
          ) : oldRef.trim().length >= 3 ? (
            <span className="text-flag">
              We can&apos;t find that reference on your account. Check it against
              your certificate — or message us and we&apos;ll track it down.
            </span>
          ) : (
            <span className="text-ink/45">
              Filled in when you pick a job above. Type it yourself for a job too
              old to be listed — it&apos;s on your certificate, and spaces and
              dashes don&apos;t matter.
            </span>
          )}
        </p>
      </div>

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

      <label className="label mt-5" htmlFor="notes">Anything Else We Should Know</label>
      <textarea id="notes" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)}
        className="field resize-y"
        placeholder="Why it changed, whether anything has been built yet, and anything the surveyor should look at first." />

      <label className="label mt-5" htmlFor="files">Revised Drawings</label>
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const d = Array.from(e.dataTransfer?.files || []).filter((f) => /\.pdf$/i.test(f.name));
          if (d.length) setFiles((prev) => [...prev, ...d]);
        }}>
      <input id="files" type="file" multiple
        onChange={(e) => setFiles(Array.from(e.target.files || []))}
        className="field file:mr-3 file:rounded file:border-0 file:bg-wash file:px-3 file:py-1.5 file:text-[13px]" />
      </div>
      <p className="mt-1.5 text-[12px] text-ink/50">
        Send the amended plans, and the engineering if it changed too. Up to 40 MB.
      </p>

      {/* A resolved job, not merely something typed. An amendment against
          nothing has nobody to route to and no card to note, and the client
          would only find that out from a 404 after uploading their drawings. */}
      <button className="btn mt-6 w-full" disabled={busy || !target}>
        {busy ? "Sending…" : "Request the Amendment"}
      </button>
      {!target && (query.trim() || oldRef.trim()) && !looking && (
        <p className="mt-2 text-center text-[12.5px] text-ink/50">
          Pick a job from the list, or enter a reference we can find.
        </p>
      )}

      {msg && (
        <p className="mt-4 rounded-sm border-l-[3px] border-flag bg-[#FBECEC] px-3 py-2 text-[13px] text-ink/80">
          {msg}
        </p>
      )}
    </form>
  );
}
