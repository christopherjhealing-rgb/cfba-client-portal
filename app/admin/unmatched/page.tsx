import Link from "next/link";
import { redirect } from "next/navigation";
import { isStaff } from "@/lib/session";
import * as repo from "@/lib/repo";
import { StaffShell } from "@/components/StaffShell";
import { UnmatchedClients } from "@/components/UnmatchedClients";

export const dynamic = "force-dynamic";

export default async function UnmatchedPage() {
  if (!(await isStaff())) redirect("/admin/login");

  const [companies, lastSync] = await Promise.all([
    repo.listCompanies(),
    repo.getSetting<{ unmatched?: { ref: string; client: string }[] }>("last_sync").catch(() => null),
  ]);
  const unmatched = lastSync?.unmatched || [];

  return (
    <StaffShell title="Unmatched Clients" sub="Board cards whose Client matches no portal client." active="/admin/clients">
      <Link href="/admin" className="text-[13px] text-seal underline">← Back to Queue</Link>
      <p className="eyebrow mt-4">Client matching</p>
      <h1 className="mb-1 mt-1 font-display text-[26px] font-semibold">Unmatched Monday Clients</h1>
      <p className="mb-6 max-w-2xl text-[14px] leading-relaxed text-ink/65">
        A board card whose <strong>Client</strong> spelling matches no client
        here is invisible to the portal — its jobs and messages reach nobody.
        Match each spelling to the right client, or create a new one, and it
        attaches on the next sync. Read from the last sync.
      </p>

      <UnmatchedClients
        unmatched={unmatched}
        companies={companies.map((c) => ({ id: c.id, name: c.name }))}
      />
    </StaffShell>
  );
}
