"use client";
import { useEffect, useState } from "react";
import { AddressField } from "./AddressField";
import { BushfireAssessment } from "./BushfireAssessment";
import { FileBucket, type Bucket } from "./FileBucket";
import { uploadDirect } from "@/lib/upload-client";
import { GOOGLE_MAPS_KEY, geocodeAddress } from "@/lib/google-maps";
import type { LibraryDoc } from "@/lib/library";
import { JobItems, blankItem, type Item } from "./JobItems";
import { describeJob } from "@/lib/jobdesc.mjs";
import { balKinds } from "@/lib/bushfire.mjs";
import { plannedName } from "@/lib/uploads.mjs";

// Drawings and engineering are both required: an assessment cannot start
// without them, and a job lodged short of them only comes straight back.
const BUCKETS: Bucket[] = [
  { key: "drawings", label: "Drawings", required: true,
    hint: "Site plan and elevations. Guidance notes 01 and 05 list what they need to show." },
  { key: "engineering", label: "Engineering", required: true,
    hint: "Signed and dated structural certification. Guidance note 02 lists what we look for." },
  { key: "other", label: "Other Supporting Documents",
    hint: "BAL report, site photos, soil classification — anything else relevant. Optional." },
];

export function SubmitForm({ seedItems }: { seedItems?: Item[] } = {}) {
  const [address, setAddress] = useState("");
  // Class and description are no longer typed — they're derived from the rows
  // below. See lib/jobdesc. seedItems is a "lodge similar" duplicate carrying
  // the previous job's work forward — the address is deliberately NOT carried,
  // so a duplicate can never lodge at the wrong site by leaving it unchanged.
  const [items, setItems] = useState<Item[]>(
    seedItems && seedItems.length ? seedItems : [blankItem()]);
  const [notes, setNotes] = useState("");
  const [clientRef, setClientRef] = useState("");
  const [contact, setContact] = useState("");
  const [files, setFiles] = useState<Record<string, File[]>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [library, setLibrary] = useState<LibraryDoc[]>([]);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [saveEng, setSaveEng] = useState(false);
  const [saveLabel, setSaveLabel] = useState("");
  const [bushfireProne, setBushfireProne] = useState(false);
  // The BAL assessment's conclusion: a one-line summary for the office notes,
  // and the BAL column label to stamp on the Monday card.
  const [bushfireSummary, setBushfireSummary] = useState<string | null>(null);
  const [bushfireBal, setBushfireBal] = useState<string | null>(null);
  // What the verdict obliges them to attach (owner's rule): a shed's own new
  // report, or evidence of the house's rating. Gates the lodge button.
  const [bushfireNeeds, setBushfireNeeds] = useState<"shed-report" | "evidence" | null>(null);
  // Strata is self-declared for now (auto-detection waits on the cadastre
  // licence); declaring it makes the strata plan a required document.
  const [strata, setStrata] = useState(false);

  // The company's saved documents (see My details). A failed fetch just means
  // no tick-list — the form works exactly as before.
  useEffect(() => {
    fetch("/api/library")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (Array.isArray(d?.docs)) setLibrary(d.docs); })
      .catch(() => {});
  }, []);

  // Bush fire prone flag. When the address settles, geocode it and ask whether
  // the lot falls in a designated Bush Fire Prone Area — if it does, a BAL
  // assessment is usually needed and we say so here, at lodgement, instead of
  // it surfacing weeks later. Entirely additive and best-effort: no Maps key,
  // no geocode, the check switched off, or any error at all, and the form is
  // exactly as it was. It never blocks a lodgement and never shows an error.
  useEffect(() => {
    setBushfireProne(false);
    setBushfireSummary(null);
    setBushfireBal(null);
    if (!GOOGLE_MAPS_KEY) return;
    const text = address.trim();
    // Enough to be worth geocoding: a number and a street, not a half-typed
    // word. Keeps the geocode to roughly one per finished address.
    if (text.length < 8 || !/\s/.test(text)) return;
    let alive = true;
    const timer = setTimeout(async () => {
      const at = await geocodeAddress(text);
      if (!alive || !at) return;
      try {
        const r = await fetch(`/api/bushfire?lat=${at.lat}&lng=${at.lng}`);
        const d = await r.json().catch(() => ({}));
        if (alive && d?.checked && d.prone) setBushfireProne(true);
      } catch { /* best-effort — a missing flag is a non-event */ }
    }, 800);
    return () => { alive = false; clearTimeout(timer); };
  }, [address]);

  // The bushfire questions only exist when the lot is prone AND the job's own
  // rows include a Class 10a building — a patio/carport or a shed. 10b work
  // (retaining walls, pools, tanks) never triggers them. Derived, not asked:
  // the form already knows what's being built.
  const kinds = balKinds(items);
  const balRequired = bushfireProne && (kinds.patio || kinds.shed);

  // A stale conclusion must never ride along after its trigger goes away —
  // the address moved off a prone lot, or the patio row was deleted.
  useEffect(() => {
    if (!balRequired) {
      setBushfireSummary(null); setBushfireBal(null); setBushfireNeeds(null);
      setFiles((prev) => (prev.bal?.length ? { ...prev, bal: [] } : prev));
    }
  }, [balRequired]);

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
    // Class and description are compulsory, so a row that says nothing stops
    // the lodgement rather than being quietly dropped on the way past.
    const said = describeJob(items);
    if (!said.ok) { setMsg(said.error); return; }

    // A ticked saved document counts as engineering — that's the point of it.
    const short = BUCKETS.filter((b) => b.required && !(files[b.key] || []).length
      && !(b.key === "engineering" && tickedDocs.length));
    if (short.length) {
      setMsg(`Please attach ${short.map((b) => b.label.toLowerCase()).join(" and ")} before lodging.`);
      return;
    }
    setBusy(true); setMsg(null);

    // The bushfire assessment rides along in the notes to the office, so the
    // surveyor sees the client's own answer (distance, house age → BAL
    // outcome) on the job without re-asking. Only when the questions were
    // actually triggered and answered.
    const notesOut = [
      notes.trim(),
      balRequired ? bushfireSummary : null,
      strata ? "Strata lot — strata plan attached." : null,
    ].filter(Boolean).join("\n\n");

    // Files go straight to storage via signed URLs (see lib/upload-client) —
    // a full drawing set doesn't fit through a serverless request body. Site
    // photos aren't a bucket of their own; they ride in Other Supporting
    // Documents like any other PDF.
    const entries = [
      ...BUCKETS.flatMap((b) =>
        (files[b.key] || []).map((f) => ({ file: f, category: b.key }))),
      // Conditional required documents ride as "other": kept under their own
      // names, never combined — a BAL report or strata plan is its own record.
      ...(files.bal || []).map((f) => ({ file: f, category: "other" })),
      ...(files.strata || []).map((f) => ({ file: f, category: "other" })),
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
          address, items, notes: notesOut, contact, clientRef,
          bal: balRequired ? bushfireBal : null,
          draftId: up.draftId,
          files: entries.map((x, i) => ({ name: up.names[i], category: x.category })),
          libraryIds: tickedDocs.map((d) => d.id),
        }),
      });
    } else {
      // Demo/local fallback: the original inline path.
      const fd = new FormData();
      fd.set("address", address);
      fd.set("items", JSON.stringify(items));
      fd.set("notes", notesOut);
      if (balRequired && bushfireBal) fd.set("bal", bushfireBal);
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
          Thanks — it&apos;s lodged and showing at the top of{" "}
          <span className="font-medium">My Jobs</span>{" "}now. We&apos;re placing it on
          our board; follow its progress here any time.
        </p>
        {clientRef.trim() && (
          <p className="mx-auto mt-2.5 max-w-sm text-[13px] text-ink/60">
            Your ref{" "}
            <span className="font-mono font-medium text-ink/80">{clientRef.trim()}</span>{" "}
            is on the job — you&apos;ll see it against this job and in our emails.
          </p>
        )}
        {/* Plain anchors on purpose: "Lodge Another Job" must arrive on a
            fresh form, and a client-side hop to the route we're already on
            wouldn't remount this component — the full load does. */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <a href="/jobs" className="btn">View My Jobs</a>
          <a href="/submit" className="btn-ghost">Lodge Another Job</a>
        </div>
      </div>
    );
  }

  const all = [...BUCKETS.flatMap((b) => files[b.key] || []),
    ...(files.bal || []), ...(files.strata || [])];
  const count = all.length + tickedDocs.length;
  const totalMb = (all.reduce((n, f) => n + f.size, 0)
    + tickedDocs.reduce((n, d) => n + d.size, 0)) / 1_048_576;
  // Compulsory now means compulsory: no readable row, no lodgement. A row
  // whose "Other" has nothing typed in it doesn't count as one. And on a
  // bushfire-prone lot with a 10a building, the bushfire questions are part
  // of the lodgement, not an optional extra — the office needs the outcome.
  const described = describeJob(items).ok;
  const filesOk = BUCKETS.every((b) => !b.required || (files[b.key] || []).length > 0
    || (b.key === "engineering" && tickedDocs.length > 0));
  const balDone = !balRequired || bushfireSummary !== null;
  const balDocOk = !balRequired || !bushfireNeeds || (files.bal || []).length > 0;
  const strataOk = !strata || (files.strata || []).length > 0;
  const ready = described && filesOk && balDone && balDocOk && strataOk;

  return (
    <form onSubmit={submit} className="card p-6 sm:p-7">
      <label className="label" htmlFor="address">Site Address</label>
      <AddressField id="address" required autoFocus value={address}
        onChange={setAddress} placeholder="32 Elvira St, Palmyra" />

      <div className="mt-5">
        <JobItems items={items} onChange={setItems} />
      </div>

      {/* Before Supporting Documents on purpose: the verdict can ask for BAL
          evidence, and the place to attach it is the section directly below. */}
      {balRequired && (
        <BushfireAssessment
          patio={kinds.patio}
          shed={kinds.shed}
          onResult={(r) => {
            setBushfireSummary(r?.summary ?? null);
            setBushfireBal(r?.bal ?? null);
            setBushfireNeeds(r?.needs ?? null);
          }}
        />
      )}
      {balRequired && bushfireNeeds && (
        <div className="mt-3">
          <FileBucket
            bucket={{
              key: "bal", required: true,
              label: bushfireNeeds === "shed-report"
                ? "New BAL Report for the Shed"
                : "BAL Rating Evidence",
              hint: bushfireNeeds === "shed-report"
                ? "The shed's own report from an accredited BAL assessor."
                : "The original BAL report or certificate, the house's Certificate of Design Compliance, or house plans noting the rating.",
            }}
            files={files.bal || []}
            onChange={(f) => setFiles((prev) => ({ ...prev, bal: f }))}
          />
        </div>
      )}

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
                onChange={(f) => setFiles((prev) => ({ ...prev, [b.key]: f }))}
                combinedAs={plannedName(b.key, address)} />

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
                // Deliberately dressed like part of the Engineering bucket —
                // it IS the second way to satisfy it. Tick as many as apply;
                // no re-upload. (Owner: make this obvious — it was too quiet.)
                <div className="mt-2 rounded-lg border border-seal/35 bg-[#F4F8F4] px-4 py-3">
                  <p className="font-display text-[13px] font-semibold text-seal-deep">
                    From Your Documents — attach saved engineering
                  </p>
                  <p className="mt-0.5 text-[12px] leading-snug text-ink/55">
                    Engineering you&apos;ve saved with us. Tick any that apply — they
                    attach to this job without another upload. Manage them under{" "}
                    <a href="/documents" className="font-medium underline underline-offset-2 hover:text-seal">My Documents</a>.
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
                // The save-for-next-time offer, made properly visible (owner:
                // it was easy to miss as a bare checkbox).
                <div className="mt-2 rounded-lg border border-seal/35 bg-[#F4F8F4] px-4 py-3">
                  <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-ink/80">
                    <input type="checkbox" checked={saveEng}
                      onChange={(e) => setSaveEng(e.target.checked)}
                      className="h-4 w-4 rounded border-rule accent-[#1E5B3C]" />
                    <span>
                      <span className="font-display font-semibold text-seal-deep">
                        Save this engineering to My Documents
                      </span>{" "}
                      — next job, it&apos;s one tick instead of another upload.
                    </span>
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
        </div>
        <p className="mt-2 text-[12px] text-ink/50">
          {totalMb > 0
            ? `${count} file${count === 1 ? "" : "s"}, ${totalMb.toFixed(1)} MB of 40 MB.`
            : "Up to 40 MB in total. Email anything larger to the office."}
        </p>

        <div className="mt-4 rounded-lg border border-rule bg-white px-4 py-3">
          <label className="flex cursor-pointer items-center gap-2.5 text-[13.5px] text-ink/80">
            <input type="checkbox" checked={strata}
              onChange={(e) => setStrata(e.target.checked)}
              className="h-4 w-4 rounded border-rule accent-[#1E5B3C]" />
            <span>This lot is part of a <span className="font-medium">strata</span></span>
          </label>
          {strata && (
            <div className="mt-3">
              <FileBucket
                bucket={{
                  key: "strata", required: true, label: "Strata Plan",
                  hint: "The strata plan showing this lot — we can't assess a strata site without it.",
                }}
                files={files.strata || []}
                onChange={(f) => setFiles((prev) => ({ ...prev, strata: f }))}
              />
            </div>
          )}
        </div>
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

      {/* A name, not an address. Whoever is answering for this job is a person
          we ring or ask for by name; the email we already have from the login,
          and asking for a second one only invited a typo that nothing checks. */}
      <label className="label mt-4" htmlFor="contact">Contact for This Job (optional)</label>
      <input id="contact" value={contact} maxLength={80}
        onChange={(e) => setContact(e.target.value)} className="field"
        placeholder="Who should we speak to about this one?" />
      <p className="mt-1.5 text-[12px] text-ink/50">
        A name is enough — we&apos;ll reply to your account either way.
      </p>

      {busy ? (
        // The whole lodgement can take a while on a big drawing set over site
        // wifi — without this, a quiet button reads as "stalled" and gets a
        // second click or a closed tab. Named stages, and a clear don't-close.
        <div className="mt-6 rounded-lg border border-seal/35 bg-[#F4F8F4] px-4 py-4 text-center" role="status" aria-live="polite">
          <span className="mx-auto mb-2 block h-6 w-6 animate-spin rounded-full border-2 border-seal/30 border-t-seal motion-reduce:animate-none" aria-hidden="true" />
          <p className="font-display text-[14px] font-semibold text-seal-deep">
            {progress || "Lodging your job…"}
          </p>
          <p className="mt-1 text-[12.5px] text-ink/60">
            Big drawing sets can take a minute — leave this page open and
            we&apos;ll confirm the moment it&apos;s lodged.
          </p>
        </div>
      ) : (
        <button className="btn mt-6 w-full" disabled={!ready}>
          Lodge This Job
        </button>
      )}
      {!ready && !busy && (
        <p className="mt-2 text-center text-[12px] text-ink/60">
          {!described
            ? "Tell us what's being built, and the button unlocks."
            : !filesOk
              ? `Still needed: ${BUCKETS.filter((b) => b.required && !(files[b.key] || []).length
                  && !(b.key === "engineering" && tickedDocs.length))
                  .map((b) => b.label.toLowerCase()).join(" and ")} — attach ${
                  BUCKETS.filter((b) => b.required && !(files[b.key] || []).length
                  && !(b.key === "engineering" && tickedDocs.length)).length === 1 ? "it" : "them"} and the button unlocks.`
              : !balDone
                ? "Answer the bushfire questions above to lodge."
                : !balDocOk
                  ? (bushfireNeeds === "shed-report"
                      ? "Still needed: the shed's new BAL report — attach it and the button unlocks."
                      : "Still needed: BAL rating evidence — attach it and the button unlocks.")
                  : "Still needed: the strata plan — attach it and the button unlocks."}
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
