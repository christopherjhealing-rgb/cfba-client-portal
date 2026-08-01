import { redirect } from "next/navigation";
import { getClientSession } from "@/lib/session";
import { unreadCount } from "@/lib/unread";
import { AppShell, PageHead } from "@/components/AppShell";
import { disabledPages, hiddenHrefs } from "@/lib/pages";
import { PageOffline } from "@/components/PageOffline";
import { SitePlanBuilder } from "@/components/SitePlanBuilder";

export const dynamic = "force-dynamic";

/** Site plan tool — draw and print a dimensioned site plan. Early version;
 *  toggleable from /admin while it matures. The tool measures, it never
 *  judges: no compliance wording here or in the builder. */
export default async function SitePlan() {
  const session = await getClientSession();
  if (!session) redirect("/");

  const [unread, hidden] = await Promise.all([
    unreadCount(session.companyId),
    disabledPages(),
  ]);

  if (hidden.has("sitePlan")) {
    return (
      <AppShell company={session.companyName} impersonated={session.impersonated} unread={unread} hidden={hiddenHrefs(hidden)}>
        <PageOffline section="The site plan tool" />
      </AppShell>
    );
  }

  return (
    <AppShell company={session.companyName} impersonated={session.impersonated} unread={unread} hidden={hiddenHrefs(hidden)}>
      <PageHead
        hero="/heroes/street.jpg"
        title="Site plan tool"
        sub="Set out your lot, place the structures, and print a clear, dimensioned site plan."
        action={<span className="chip">Early version</span>}
      />
      <div className="card mb-5 p-5">
        <p className="max-w-2xl text-[14px] leading-relaxed text-ink/70">
          A clear site plan with every dimension on it is the single best thing
          you can lodge with — most of the questions we have to come back with
          start from a plan that leaves us guessing. This tool helps you prepare
          one: it draws and measures what you enter. Whether what you&apos;ve
          drawn complies is judged during assessment, so if you&apos;re unsure
          about a distance or a detail, ask us before you lodge.
        </p>
      </div>
      <SitePlanBuilder companyId={session.companyId} />
    </AppShell>
  );
}
