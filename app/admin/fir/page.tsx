import Link from "next/link";
import { redirect } from "next/navigation";
import { isStaff } from "@/lib/session";
import { StaffShell } from "@/components/StaffShell";
import { FirLibrary, type FirRow } from "@/components/FirLibrary";
import { getFirEdits, isEdited } from "@/lib/fir-library";
import { FIR_ITEMS, normalise, duplicateKeys } from "@/lib/fir.mjs";

export const dynamic = "force-dynamic";

export default async function FirPage() {
  if (!(await isStaff())) redirect("/admin/login");

  const edits = await getFirEdits();
  const off = new Set((edits.disabled || []).map(normalise));

  // The shipped set is shown even when switched off — the whole point of "off"
  // rather than "deleted" is that the wording is still there to put back.
  const shipped: FirRow[] = FIR_ITEMS.map((it) => {
    const e = edits.edits?.[it.code];
    const merged = e ? { ...it, title: e.title || it.title, body: e.body || it.body } : it;
    return {
      ...merged,
      shipped: true,
      edited: isEdited(it, edits),
      disabled: off.has(normalise(it.code)),
    };
  });

  const ours: FirRow[] = (edits.extra || []).map((it) => ({
    ...it, group: it.group || "Ours", shipped: false, edited: false, disabled: false,
  }));

  const rows = [...shipped, ...ours];
  const clashes = duplicateKeys(rows);

  return (
    <StaffShell
      title="FIR Library"
      sub="Type a shortcut on the card; the portal writes the request and sends it."
      active="/admin/fir"
    >
      <Link href="/admin" className="text-[13px] text-seal underline">← Back to Admin</Link>

      <div className="mt-4" />

      {clashes.length > 0 && (
        <div className="mb-6 rounded-lg border border-flag/40 bg-[#FBECEC] px-4 py-3 text-[13px] leading-relaxed text-ink/80">
          <strong>Two shortcuts answer to the same word.</strong> One of them will never
          fire, and which one depends on the order they were added — worth fixing now
          rather than wondering later why a request didn&apos;t go.
          <ul className="mt-1.5 list-disc pl-5">
            {clashes.map((c) => (
              <li key={c.key}><span className="font-mono">{c.key}</span> — {c.codes.join(" and ")}</li>
            ))}
          </ul>
        </div>
      )}

      <FirLibrary rows={rows} />
    </StaffShell>
  );
}
