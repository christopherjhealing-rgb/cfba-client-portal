"use client";
import { useState } from "react";
import { FileBucket, type Bucket } from "./FileBucket";
import { uploadDirect } from "@/lib/upload-client";

// Drawings and engineering are both required: an assessment cannot start
// without them, and a job lodged short of them only comes straight back.
const BUCKETS: Bucket[] = [
  { key: "drawings", label: "Drawings", required: true,
    hint: "Site plan and elevations. Guidance notes 01 and 05 list what they need to show." },
  { key: "engineering", label: "Engineering", required: true,
    hint: "Signed and dated structural certification. Guidance note 02 lists what we look for." },
  { key: "other", label: "Other supporting documents",
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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const short = BUCKETS.filter((b) => b.required && !(files[b.key] || []).length);
    if (short.length) {
      setMsg(`Please attach ${short.map((b) => b.label.toLowerCase()).join(" and ")} before lodging.`);
      return;
    }
    setBusy(true); setMsg(null);

    // Files go straight to storage via signed URLs (see lib/upload-client) —
    // a full drawing set doesn't fit through a serverless request body.
    const entries = BUCKETS.flatMap((b) =>
      (files[b.key] || []).map((f) => ({ file: f, category: b.key }))
    );
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
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
        </div>
        <h2 className="font-display text-[21px] font-semibold">Job lodged</h2>
        <p className="mx-auto mt-2 max-w-sm text-[14px] leading-relaxed text-ink/65">
          {instant ? (
            <>Thanks — it&apos;s gone straight through to the CFBA team and will
            appear in your job list shortly.</>
          ) : (
            <>Thanks — it&apos;s with the CFBA office for checking. It will show in your
            job list under <span className="font-medium">Waiting to be accepted</span>,
            and once it&apos;s accepted you&apos;ll be able to follow its progress here.</>
          )}
        </p>
        <a href="/jobs" className="btn mt-6">Back to my jobs</a>
      </div>
    );
  }

  const all = BUCKETS.flatMap((b) => files[b.key] || []);
  const totalMb = all.reduce((n, f) => n + f.size, 0) / 1_048_576;
  const ready = BUCKETS.every((b) => !b.required || (files[b.key] || []).length > 0);

  return (
    <form onSubmit={submit} className="card p-6 sm:p-7">
      <label className="label" htmlFor="address">Site address</label>
      <input id="address" required autoFocus value={address}
        onChange={(e) => setAddress(e.target.value)} className="field"
        placeholder="32 Elvira St, Palmyra" />

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
        <p className="label">Supporting documents</p>
        <p className="mb-3 text-[13px] leading-relaxed text-ink/60">
          Drawings and engineering are both needed before an assessment can start.
          A job lodged without them will only come straight back to you.
        </p>
        <div className="space-y-3">
          {BUCKETS.map((b) => (
            <FileBucket key={b.key} bucket={b} files={files[b.key] || []}
              onChange={(f) => setFiles((prev) => ({ ...prev, [b.key]: f }))} />
          ))}
        </div>
        <p className="mt-2 text-[12px] text-ink/50">
          {totalMb > 0
            ? `${all.length} file${all.length === 1 ? "" : "s"}, ${totalMb.toFixed(1)} MB of 40 MB.`
            : "Up to 40 MB in total. Email anything larger to the office."}
        </p>
      </div>

      <label className="label mt-6" htmlFor="clientRef">Your reference (optional)</label>
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

      <label className="label mt-4" htmlFor="contact">Contact for this job (optional)</label>
      <input id="contact" type="email" value={contact}
        onChange={(e) => setContact(e.target.value)} className="field"
        placeholder="site.supervisor@yourcompany.com.au" />

      <button className="btn mt-6 w-full" disabled={busy || !ready}>
        {busy ? (progress || "Lodging…") : "Lodge this job"}
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
