import Link from "next/link";
import { redirect } from "next/navigation";
import { getClientSession } from "@/lib/session";
import { unreadCount } from "@/lib/unread";
import { AppShell, PageHead } from "@/components/AppShell";
import { disabledPages, hiddenHrefs } from "@/lib/pages";
import { PageOffline } from "@/components/PageOffline";
import { BushfireCheck } from "@/components/BushfireCheck";
import { WindClassCheck } from "@/components/WindClassCheck";
import { SoakwellCheck } from "@/components/SoakwellCheck";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

/**
 * The tools, together.
 *
 * They used to be scattered — two checkers buried at the top of Resources
 * above the council forms, and the site plan and engineering apps as separate
 * nav items with nothing tying them to each other. A client who found one had
 * no reason to think the others existed.
 *
 * Resources keeps what it was always for: the forms and links you need to
 * lodge with a council. This page is the things that answer a question.
 */
export default async function Tools() {
  const session = await getClientSession();
  if (!session) redirect("/");

  const [unread, hidden] = await Promise.all([
    unreadCount(session.companyId),
    disabledPages(),
  ]);

  if (hidden.has("tools")) {
    return (
      <AppShell company={session.companyName} impersonated={session.impersonated}
        unread={unread} hidden={hiddenHrefs(hidden)}>
        <PageOffline section="Tools" />
      </AppShell>
    );
  }

  // The site plan tool and the engineering checkers are whole apps with their
  // own screens, so they're linked rather than embedded — and engineering only
  // appears once staff have switched it on.
  const apps = [
    {
      href: "/site-plan", icon: "ruler" as const, title: "Site Plan Tool",
      blurb: "Draws a compliant A4 site plan at a real scale from your actual lot boundary — north point, scale bar, dimensions to every boundary, title block.",
      show: !hidden.has("sitePlan"),
    },
    {
      href: "/engineering", icon: "beam" as const, title: "Engineering Checker",
      blurb: "Check a design against the engineering before you lodge — whether it's covered, which members are required, and exactly where in the tables each answer comes from.",
      show: !hidden.has("engineering"),
    },
  ].filter((a) => a.show);

  return (
    <AppShell company={session.companyName} impersonated={session.impersonated}
      unread={unread} hidden={hiddenHrefs(hidden)}>
      <PageHead hero="/heroes/patio.jpg" title="Tools"
        sub="The questions we're asked most, answered before you lodge." />

      <p className="mb-6 max-w-2xl text-[13.5px] leading-relaxed text-ink/60">
        All free, and none of them need us. Every one is a guide rather than a
        determination — the classification on a job is the one on our
        certificate — but they settle, in a minute, most of what would
        otherwise send a job back to you.
      </p>

      <div className="mb-6"><BushfireCheck /></div>
      <div className="mb-6"><WindClassCheck /></div>
      <div className="mb-6"><SoakwellCheck /></div>

      {apps.length > 0 && (
        <section className="mb-8">
          <div className="mb-2.5 flex items-center gap-3">
            <h2 className="font-display text-[12px] font-semibold uppercase tracking-[0.15em] text-ink/70">
              Bigger Tools
            </h2>
            <span className="h-px flex-1 bg-rule" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {apps.map((a) => (
              <Link key={a.href} href={a.href}
                className="card flex items-start gap-3.5 p-4 transition hover:border-seal/40 hover:bg-wash">
                <span className="mt-0.5 shrink-0 text-seal"><Icon name={a.icon} size={20} /></span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 font-display text-[15px] font-semibold text-ink">
                    {a.title} <Icon name="arrowRight" size={14} />
                  </span>
                  <span className="mt-1 block text-[13px] leading-relaxed text-ink/60">{a.blurb}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="card p-4">
        <p className="text-[13px] leading-relaxed text-ink/65">
          Looking for council forms, the councils themselves, or the guidance
          notes? They&apos;re under{" "}
          <Link href="/resources" className="font-medium text-seal underline">Resources</Link>{" "}
          and{" "}
          <Link href="/info-sheets" className="font-medium text-seal underline">Info Sheets</Link>.
        </p>
      </div>
    </AppShell>
  );
}
