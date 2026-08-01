import Link from "next/link";
import { redirect } from "next/navigation";
import { getClientSession } from "@/lib/session";
import { env } from "@/lib/env";
import { unreadCount } from "@/lib/unread";
import { AppShell, PageHead } from "@/components/AppShell";
import { disabledPages, hiddenHrefs } from "@/lib/pages";
import { PageOffline } from "@/components/PageOffline";
import { TurnaroundNote } from "@/components/Turnaround";

export const dynamic = "force-dynamic";

const FAQ = [
  {
    q: "Can a job be marked urgent?",
    a: "Tell us when you lodge it rather than after, and we'll be honest about what's possible. What actually speeds a job up is lodging it complete — a certificate that has to be corrected, or that comes back from the permit authority, costs far more time than the assessment ever saves.",
  },
  {
    q: "How do I know when my job is ready?",
    a: "We email you the moment a job is issued. It also moves into Ready to download on your dashboard, so you can check here any time without waiting for the email.",
  },
  {
    q: "What's in the download?",
    a: "One file containing the certificate of design compliance and every supporting drawing and document, each stamped with your job reference.",
  },
  {
    q: "You've asked me for further information — what do I do?",
    a: "Open the job from the Further information required panel on your dashboard and send it straight through. It reaches the surveyor working on your job; there's no need to email as well.",
  },
  {
    q: "How long can I download a job for?",
    a: `${env.retentionMonths} months from the day you first download it. The countdown is shown against each job under Downloads, and turns amber in the last month — so save the package with your job records when you get it.`,
  },
  {
    q: "Can other people at my company use the portal?",
    a: "Yes — there's one login per company, and everyone who uses it sees the same jobs. Share it with whoever needs it in your office. If you ever need the password changed, ring us and we'll reset it on the spot.",
  },
  {
    q: "Something looks wrong on a job",
    a: "Give us a ring and quote the job number — if anything on a certificate looks off, we'd much rather hear about it before the work goes ahead than after. A two-minute call sorts most of these.",
  },
];

export default async function Help() {
  const session = await getClientSession();
  if (!session) redirect("/");
  const unread = await unreadCount(session.companyId);

  const hidden = await disabledPages();

  if (hidden.has("help")) {
    return (
      <AppShell company={session.companyName} impersonated={session.impersonated} unread={unread} hidden={hiddenHrefs(hidden)}>
        <PageOffline section="Help & support" />
      </AppShell>
    );
  }

  return (
    <AppShell company={session.companyName} impersonated={session.impersonated} unread={unread} hidden={hiddenHrefs(hidden)}>
      <PageHead hero="/heroes/entry.jpg" title="Help & support" sub="How the portal works, and how to reach us." />

      <div className="mb-6"><TurnaroundNote /></div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px] lg:items-start">
        <div className="card divide-y divide-rule overflow-hidden">
          {FAQ.map((f) => (
            <div key={f.q} className="px-5 py-4">
              <p className="font-display text-[15px] font-semibold text-ink">{f.q}</p>
              <p className="mt-1.5 max-w-2xl text-[14px] leading-relaxed text-ink/70">{f.a}</p>
            </div>
          ))}
        </div>

        <div className="card p-5">
          <p className="font-display text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/50">
            Contact us
          </p>
          <p className="mt-3 text-[14px] font-medium text-ink">CF Building Approvals</p>
          <p className="mt-2 text-[14px] text-ink/70">
            <a className="text-seal underline underline-offset-2" href="tel:1300029074">1300 029 074</a>
          </p>
          <p className="mt-1 text-[14px] text-ink/70">
            <a className="text-seal underline underline-offset-2" href="mailto:admin@cfba.com.au">
              admin@cfba.com.au
            </a>
          </p>
          <p className="mt-4 text-[13px] leading-relaxed text-ink/55">
            Office hours Monday to Friday. Quote your job number and we&apos;ll get to it faster.
          </p>
          <Link href="/submit" className="btn mt-5 w-full">Lodge a job</Link>
        </div>
      </div>

      <p className="mt-6 text-[12px] text-ink/40">
        Jobs stay downloadable for {env.retentionMonths} months after first download.
      </p>
    </AppShell>
  );
}
