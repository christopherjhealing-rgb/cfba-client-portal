import { redirect } from "next/navigation";
import { getClientSession } from "@/lib/session";
import * as repo from "@/lib/repo";
import { unreadCount } from "@/lib/unread";
import { AppShell, PageHead } from "@/components/AppShell";
import { disabledPages, hiddenHrefs } from "@/lib/pages";
import { Icon } from "@/components/Icon";
import { TeamLogins, type TeamLogin } from "@/components/TeamLogins";
import { listLibrary } from "@/lib/library";

export const dynamic = "force-dynamic";

export default async function Details() {
  const session = await getClientSession();
  if (!session) redirect("/");
  // In parallel, and each caught: a hiccup reading the document library — a
  // portal_settings read — should not 500 the whole My Details page. The other
  // client pages that touch these already catch; this one was the exception.
  const [unread, company, jobs, docs, logins, hidden] = await Promise.all([
    unreadCount(session.companyId).catch(() => 0),
    repo.companyById(session.companyId).catch(() => null),
    repo.listJobsForCompany(session.companyId).catch(() => []),
    listLibrary(session.companyId).catch(() => []),
    repo.listLoginsForCompany(session.companyId).catch(() => []),
    disabledPages(),
  ]);
  const jobCount = jobs.length;

  // Whitelisted BEFORE crossing to the client component — a Login row carries
  // password and setup-code hashes, and component props end up in the page
  // payload. You first, then active, then disabled.
  const team: TeamLogin[] = logins
    .map((l) => ({
      username: l.username,
      displayName: l.displayName || "",
      lastLoginAt: l.lastLoginAt,
      disabled: l.disabled,
      you: l.username === session.username,
    }))
    .sort((a, b) =>
      Number(b.you) - Number(a.you)
      || Number(a.disabled) - Number(b.disabled)
      || a.username.localeCompare(b.username));

  return (
    <AppShell company={session.companyName} impersonated={session.impersonated} unread={unread} hidden={hiddenHrefs(hidden)}>
      <PageHead hero="/heroes/letterbox.jpg" title="My Details" sub="How your company is recorded with us." />

      <div className="card mb-6 divide-y divide-rule overflow-hidden">
        <Field label="Company Name" value={company?.name || session.companyName} />
        <Field label="Username" value={session.username} mono />
        <Field label="Email Addresses We Match Your Jobs On"
          value={company?.emails?.length ? company.emails.join("\n") : "None recorded"} />
        <Field label="Jobs on Your Account" value={String(jobCount)} />
      </div>

      {/* The document library moved to its own page (/documents) so it can be
          found — this pointer stays for anyone who knew it lived here. */}
      <div className="card mb-6 px-4 py-3.5 text-[13.5px] text-ink/70">
        Your saved engineering now lives under{" "}
        <a href="/documents" className="font-medium text-seal underline underline-offset-2">My Documents</a>{" "}
        in the sidebar — everything that was here is there.
      </div>

      {team.length > 0 && <TeamLogins logins={team} readonly={session.impersonated} />}

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
            className="btn-ghost mt-4">Email the Office</a>
        </div>
      </div>

      <div className="mt-6">
        <p className="text-[13px] text-ink/55">
          To change your password, sign out and use{" "}
          <span className="font-medium text-ink/75">Forgot Password?</span>{" "}
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
