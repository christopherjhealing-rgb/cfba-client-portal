import Link from "next/link";
import { redirect } from "next/navigation";
import { isStaff } from "@/lib/session";
import * as repo from "@/lib/repo";
import { StaffShell } from "@/components/StaffShell";
import { AmendmentList, type AmendmentRow } from "@/components/AmendmentList";
import {
  getAmendmentConfig, AMENDMENT_OPEN, AMENDMENT_DONE,
} from "@/lib/amendments";

export const dynamic = "force-dynamic";

const DAY = 86_400_000;

export default async function AmendmentsPage() {
  if (!(await isStaff())) redirect("/admin/login");

  const [open, recentlyDone, companies, cfg] = await Promise.all([
    repo.listSubmissions(AMENDMENT_OPEN).catch(() => []),
    repo.listSubmissions(AMENDMENT_DONE).catch(() => []),
    repo.listCompanies().catch(() => []),
    getAmendmentConfig(),
  ]);

  const nameOf = new Map(companies.map((c) => [c.id, c.name]));
  const now = Date.now();
  const toRow = (s: (typeof open)[number], done: boolean): AmendmentRow => ({
    id: s.id,
    parentRef: s.amendmentOf || "—",
    company: nameOf.get(s.companyId) || s.companyId,
    address: s.address,
    reason: s.description,
    notes: s.notes,
    files: done ? [] : s.files.map((f) => f.name),
    issuedFiles: done ? s.files.map((f) => f.name) : [],
    routedTo: s.reviewNote || "",
    createdAt: s.createdAt,
    days: Math.max(0, Math.floor((now - new Date(s.createdAt).getTime()) / DAY)),
    done,
  });

  const rows = [
    ...open.map((s) => toRow(s, false))
      .sort((a, b) => b.days - a.days),
    // The last fortnight's finished ones, so somebody can check what went back
    // without going near the database.
    ...recentlyDone.map((s) => toRow(s, true))
      .filter((r) => r.days <= 14)
      .sort((a, b) => a.days - b.days),
  ];

  const waiting = rows.filter((r) => !r.done).length;
  const routable = cfg.routes.length > 0 && !!cfg.fallbackName;

  return (
    <StaffShell
      title="Amendments"
      sub="Design changes and council-driven changes. Handled by email — never on the board."
      active="/admin/amendments"
    >
      <Link href="/admin" className="text-[13px] text-seal underline">← Back to Admin</Link>

      <div className="mb-6 mt-4 rounded-lg border border-rule bg-wash px-4 py-3 text-[13px] leading-relaxed text-ink/70">
        An amendment never opens a Monday card — it would sit there looking like
        an assessment when the work is a watermark and a re-issue. It emails
        whoever certified the original, with the office copied. They reply
        &ldquo;yes&rdquo; by email, exactly as before. The only thing that
        happens on this page is the revised certificate going back to the
        client, because with no card there&apos;s no sync to collect it.
      </div>

      {!routable && (
        <Link href="/admin/settings"
          className="mb-6 block rounded-lg border border-flag/40 bg-[#FBECEC] px-4 py-3 text-[13px] text-ink/80 transition hover:border-flag">
          <strong>Amendments have nowhere to go.</strong> Nobody is set up to
          receive them, so a lodged amendment will sit here silently and the
          client will think it&apos;s with you.{" "}
          <span className="text-seal underline">Set it up in Settings →</span>
        </Link>
      )}

      <div className="mb-2.5 flex items-center gap-3">
        <h2 className="font-display text-[12px] font-semibold uppercase tracking-[0.15em] text-ink/70">
          Waiting
        </h2>
        <span className="h-px flex-1 bg-rule" />
        <span className="font-mono text-[12px] text-ink/45">{waiting}</span>
      </div>

      <AmendmentList rows={rows} />
    </StaffShell>
  );
}
