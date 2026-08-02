import { redirect } from "next/navigation";
import { getClientSession } from "@/lib/session";
import * as repo from "@/lib/repo";
import { unreadCount } from "@/lib/unread";
import { AppShell, PageHead } from "@/components/AppShell";
import { disabledPages, hiddenHrefs } from "@/lib/pages";
import { Icon } from "@/components/Icon";
import { LibraryManager } from "@/components/LibraryManager";
import { listLibrary } from "@/lib/library";

export const dynamic = "force-dynamic";

export default async function Details() {
  const session = await getClientSession();
  if (!session) redirect("/");
  const unread = await unreadCount(session.companyId);

  const company = await repo.companyById(session.companyId);
  const jobCount = (await repo.listJobsForCompany(session.companyId)).length;
  const docs = await listLibrary(session.companyId);

  const hidden = await disabledPages();

  return (
    <AppShell company={session.companyName} impersonated={session.impersonated} unread={unread} hidden={hiddenHrefs(hidden)}>
      <PageHead hero="/heroes/letterbox.jpg" title="My details" sub="How your company is recorded with us." />

      <div className="card mb-6 divide-y divide-rule overflow-hidden">
        <Field label="Company name" value={company?.name || session.companyName} />
        <Field label="Username" value={session.username} mono />
        <Field label="Email addresses we match your jobs on"
          value={company?.emails?.length ? company.emails.join("\n") : "None recorded"} />
        <Field label="Jobs on your account" value={String(jobCount)} />
      </div>

      <LibraryManager initial={docs} />

      {/* Read-only on purpose: Monday is the master record, and a client
          editing their own email here would silently break job matching. */}
      <div className="card flex flex-wrap items-start gap-3.5 p-5">
        <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-wash text-seal">
          <Icon name="alert" size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[14px] font-semibold text-ink">
            Need any of this changed?
          </p>
          <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-ink/65">
            These details are held on your job records, so we update them at our end
            to keep everything matched to the right company. Email the office and
            we&apos;ll change them the same day.
          </p>
          <a href="mailto:admin@cfba.com.au"
            className="btn-ghost mt-4">Email the office</a>
        </div>
      </div>

      <div className="mt-6">
        <p className="text-[13px] text-ink/55">
          To change your password, sign out and use{" "}
          <span className="font-medium text-ink/75">Forgot password?</span>{" "}
          on the sign-in screen — we&apos;ll issue a new setup code.
        </p>
      </div>
    </AppShell>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid gap-1 px-5 py-4 sm:grid-cols-[260px_1fr] sm:gap-4">
      <div className="font-display text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/50">
        {label}
      </div>
      <div className={`whitespace-pre-line text-[14px] text-ink ${mono ? "font-mono" : ""}`}>
        {value}
      </div>
    </div>
  );
}
