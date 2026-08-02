"use client";
import { useEffect, useState } from "react";
import { AddressField } from "./AddressField";
import { FileBucket, type Bucket } from "./FileBucket";
import { PhotoBucket } from "./PhotoBucket";
import { uploadDirect } from "@/lib/upload-client";
import type { LibraryDoc } from "@/lib/library";

// Drawings and engineering are both required: an assessment cannot start
// without them, and a job lodged short of them only comes straight back.
const BUCKETS: Bucket[] = [
  { key: "drawings", label: "Drawings", required: true,
    hint: <>Site plan and elevations. Guidance notes 01 and 05 list what they
      need to show. Need a site plan?{" "}
      <a href="/site-plan" className="font-medium text-seal underline underline-offset-2">
        Draw one here</a>.</> },
  { key: "engineering", label: "Engineering", required: true,
    hint: "Signed and dated structural certification. Guidance note 02 lists what we look for." },
  { key: "other", label: "Other Supporting Documents",
    hint: "BAL assessment, soil classification, anything else relevant. Optional." },
];

const CLASS_OPTIONS = [
  "Class 10a",
  "Class 10b",
  "CBC",
  "Class 10 associated with a Commercial Building",
];

export function SubmitForm() {
  const [address, setAddress] = useState("");
  const [jobClass, setJobClass] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [clientRef, setClientRef] = useState("");
  const [contact, setContact] = useState("");
  const [files, setFiles] = useState<Record<string, File[]>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [instant, setInstant] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [library, setLibrary] = useState<LibraryDoc[]>([]);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [saveEng, setSaveEng] = useState(false);
  const [saveLabel, setSaveLabel] = useState("");

  // The company's saved documents (see My details). A failed fetch just means
  // no tick-list — the form works exactly as before.
  useEffect(() => {
    fetch("/api/library")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (Array.isArray(d?.docs)) setLibrary(d.docs); })
      .catch(() => {});
  }, []);

  const tickedDocs = library.filter((d) => ticked.has(d.id));

  function toggleDoc(id: string) {
    setTicked((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    // A ticked saved document counts as engineering — that's the point of it.
    const short = BUCKETS.filter((b) => b.required && !(files[b.key] || []).length
      && !(b.key === "engineering" && tickedDocs.length));
    if (short.length) {
      setMsg(`Please attach ${short.map((b) => b.label.toLowerCase()).join(" and ")} before lodging.`);
      return;
    }
    setBusy(true); setMsg(null);

    // Files go straight to storage via signed URLs (see lib/upload-client) —
    // a full drawing set doesn't fit through a serverless request body. Site
    // photos are already one compiled PDF by now (see PhotoBucket).
    const entries = [
      ...BUCKETS.flatMap((b) =>
        (files[b.key] || []).map((f) => ({ file: f, category: b.key }))
      ),
      ...(files.photos || []).map((f) => ({ file: f, category: "photos" })),
    ];
    const up = await uploadDirect(
      "submission",
      entries.map((x) => x.file),
      (doneCount, total) =>
        setProgress(doneCount < total ? `Uploading file ${doneCount + 1} of ${total}…` : "Finishing…")
    );
    setProgress(null);
    if ("error" in up) { setBusy(false); setMsg(up.error); return; }

    let r: Response;
    if (up.mode === "direct") {
      r = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address, jobClass, description, notes, contact, clientRef,
          draftId: up.draftId,
          files: entries.map((x, i) => ({ name: up.names[i], category: x.category })),
          libraryIds: tickedDocs.map((d) => d.id),
        }),
      });
    } else {
      // Demo/local fallback: the original inline path.
      const fd = new FormData();
      fd.set("address", address);
      fd.set("jobClass", jobClass);
      fd.set("description", description);
      fd.set("notes", notes);
      fd.set("clientRef", clientRef);
      fd.set("contact", contact);
      for (const x of entries) {
        fd.append("files", x.file);
        fd.append("fileCategories", x.category);
      }
      for (const d of tickedDocs) fd.append("libraryIds", d.id);
      r = await fetch("/api/submit", { method: "POST", body: fd });
    }
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg(d.error || "Something went wrong at our end — please try again, or ring 1300 029 074 and we'll sort it."); return; }

    // Fire-and-forget: the job is lodged, so a failed save to My documents
    // must never disturb the success screen.
    const firstEng = (files.engineering || [])[0];
    if (saveEng && firstEng) {
      const fd = new FormData();
      fd.set("file", firstEng);
      fd.set("label", saveLabel);
      void fetch("/api/library", { method: "POST", body: fd }).catch(() => {});
    }

    setInstant(!!d.accepted);
    setDone(true);
  }

  if (done) {
    // The Monday ref doesn't exist yet at this point — the board assigns it
    // after the card lands — so the honest link is the jobs list, where the
    // new job surfaces as soon as it's through. Never a dead end.
    return (
      <div className="card p-8 text-center">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-seal/10 text-seal">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
        </div>
        <h2 className="font-display text-[21px] font-semibold">Job Lodged</h2>
        <p className="mx-auto mt-2 max-w-sm text-[14px] leading-relaxed text-ink/65">
          {instant ? (
            <>Thanks — it&apos;s on our board. It&apos;ll appear at the top of
            your jobs within a couple of minutes.</>
          ) : (
            <>Thanks — it&apos;s with the CFBA office for checking. It will show in your
            job list under <span className="font-medium">Waiting to be accepted</span>,
            and once it&apos;s accepted you&apos;ll be able to follow its progress here.</>
          )}
        </p>
        {clientRef.trim() && (
          <p className="mx-auto mt-2.5 max-w-sm text-[13px] text-ink/60">
            Your ref{" "}
            <span className="font-mono font-medium text-ink/80">{clientRef.trim()}</span>{" "}
            is on the job — you&apos;ll see it against this job and in our emails.
          </p>
        )}
        <a href="/jobs" className="btn mt-6">View My Jobs</a>
      </div>
    );
  }

  const all = [...BUCKETS.flatMap((b) => files[b.key] || []), ...(files.photos || [])];
  const count = all.length + tickedDocs.length;
  const totalMb = (all.reduce((n, f) => n + f.size, 0)
    + tickedDocs.reduce((n, d) => n + d.size, 0)) / 1_048_576;
  const ready = BUCKETS.every((b) => !b.required || (files[b.key] || []).length > 0
    || (b.key === "engineering" && tickedDocs.length > 0));

  return (
    <form onSubmit={submit} className="card p-6 sm:p-7">
      <label className="label" htmlFor="address">Site Address</label>
      <AddressField id="address" required autoFocus value={address}
        onChange={setAddress} placeholder="32 Elvira St, Palmyra" />

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="class">Class</label>
          <select id="class" required value={jobClass}
            onChange={(e) => setJobClass(e.target.value)}
            className={`field ${jobClass ? "" : "text-ink/40"}`}>
            <option value="" disabled>Select a class…</option>
            {CLASS_OPTIONS.map((c) => (
              <option key={c} value={c} className="text-ink">{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="description">Description</label>
          <input id="description" required value={description}
            onChange={(e) => setDescription(e.target.value)} className="field"
            placeholder="Steel patio, steel shed…" />
        </div>
      </div>

      <div className="mt-6">
        <p className="label">Supporting Documents</p>
        <p className="mb-3 text-[13px] leading-relaxed text-ink/60">
          Drawings and engineering are both needed before an assessment can start.
          A job lodged without them will only come straight back to you.
        </p>
        <div className="space-y-3">
          {BUCKETS.map((b) => (
            <div key={b.key}>
              <FileBucket bucket={b} files={files[b.key] || []}
                onChange={(f) => setFiles((prev) => ({ ...prev, [b.key]: f }))} />

              {/* The company's saved documents ride along under Engineering:
                  tick to attach, no re-upload. Saved on the My details page.
                  First run, before anything is saved, one line sells the
                  save-for-next-time tick rather than rendering nothing. */}
              {b.key === "engineering" && library.length === 0 && (
                <p className="mt-1.5 px-1 text-[12px] leading-snug text-ink/55">
                  Lodge the same engineering often? Tick{" "}
                  <span className="font-medium text-ink/70">Save this engineering to My documents</span>{" "}
                  below once it&apos;s attached, and next time it&apos;s one tick here
                  instead of another upload.
                </p>
              )}
              {b.key === "engineering" && library.length > 0 && (
                <div className="mt-2 rounded-lg border border-rule bg-white px-4 py-3">
                  <p className="font-display text-[13px] font-semibold text-ink">
                    From Your Documents
                  </p>
                  <p className="mt-0.5 text-[12px] leading-snug text-ink/55">
                    Engineering you&apos;ve saved with us — tick to attach it to this job.
                  </p>
                  <ul className="mt-2 space-y-0.5">
                    {library.map((d) => (
                      <li key={d.id}>
                        <label className="flex cursor-pointer items-center gap-2.5 py-1 text-[13px] text-ink/80">
                          <input type="checkbox" checked={ticked.has(d.id)}
                            onChange={() => toggleDoc(d.id)}
                            className="h-4 w-4 rounded border-rule accent-[#1E5B3C]" />
                          <span className="min-w-0 flex-1 truncate">{d.label}</span>
                          <span className="shrink-0 font-mono text-[11px] text-ink/40">
                            {(d.size / 1048576).toFixed(1)} MB
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {b.key === "engineering" && (files.engineering || []).length > 0 && (
                <div className="mt-2 px-1">
                  <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-ink/70">
                    <input type="checkbox" checked={saveEng}
                      onChange={(e) => setSaveEng(e.target.checked)}
                      className="h-4 w-4 rounded border-rule accent-[#1E5B3C]" />
                    <span>Save this engineering to My documents for next time</span>
                  </label>
                  {saveEng && (
                    <input value={saveLabel} maxLength={80}
                      onChange={(e) => setSaveLabel(e.target.value)}
                      className="field mt-2 py-2 text-[14px]"
                      placeholder="Name it — e.g. Standard patio engineering" />
                  )}
                </div>
              )}
            </div>
          ))}
          <PhotoBucket files={files.photos || []}
            onChange={(f) => setFiles((prev) => ({ ...prev, photos: f }))} />
        </div>
        <p className="mt-2 text-[12px] text-ink/50">
          {totalMb > 0
            ? `${count} file${count === 1 ? "" : "s"}, ${totalMb.toFixed(1)} MB of 40 MB.`
            : "Up to 40 MB in total. Email anything larger to the office."}
        </p>
      </div>

      <label className="label mt-6" htmlFor="clientRef">Your Reference (optional)</label>
      <input id="clientRef" value={clientRef} maxLength={60}
        onChange={(e) => setClientRef(e.target.value)} className="field"
        placeholder="Your own PO or job number — shown on this job and quoted in our emails" />

      <label className="label mt-6" htmlFor="notes">Notes for CFBA (optional)</label>
      <textarea id="notes" rows={3} value={notes}
        onChange={(e) => setNotes(e.target.value)} className="field"
        placeholder="Anything we should know about this job." />
      <p className="mt-1.5 text-[12px] text-ink/50">
        Added to the job&apos;s conversation for our team — not shown as a public field.
      </p>

      <label className="label mt-4" htmlFor="contact">Contact for This Job (optional)</label>
      <input id="contact" type="email" value={contact}
        onChange={(e) => setContact(e.target.value)} className="field"
        placeholder="site.supervisor@yourcompany.com.au" />

      <button className="btn mt-6 w-full" disabled={busy || !ready}>
        {busy ? (progress || "Lodging…") : "Lodge This Job"}
      </button>
      {!ready && (
        <p className="mt-2 text-center text-[12px] text-ink/50">
          Attach drawings and engineering to continue.
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
