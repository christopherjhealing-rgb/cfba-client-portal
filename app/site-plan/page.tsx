import Link from "next/link";
import { redirect } from "next/navigation";
import { getClientSession } from "@/lib/session";
import { unreadCount } from "@/lib/unread";
import { AppShell, PageHead } from "@/components/AppShell";
import { disabledPages, hiddenHrefs } from "@/lib/pages";
import { PageOffline } from "@/components/PageOffline";
import { SitePlanBuilder } from "@/components/SitePlanBuilder";
import { CADASTRE_READY } from "@/lib/cadastre-source";

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
        <PageOffline section="The Site Plan Tool" />
      </AppShell>
    );
  }

  return (
    <AppShell company={session.companyName} impersonated={session.impersonated} unread={unread} hidden={hiddenHrefs(hidden)} wide>
      <PageHead
        hero="/heroes/street.jpg"
        title="Site Plan Tool"
        sub="Set out your lot, place the structures, and print a clear, dimensioned site plan."
        action={<span className="chip">Early Version</span>}
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
        {process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY && CADASTRE_READY && (
          <p className="mt-2.5 max-w-2xl text-[13px] leading-relaxed text-ink/60">
            Put your address in and hit <strong className="font-semibold">Find my
            lot</strong>: the tool looks your block up on the State&apos;s land
            records and draws the real boundary — shape, dimensions and
            orientation — with an aerial photo lined up behind it. Those
            boundaries are indicative rather than surveyed, so check anything
            tight against your own survey, and if your lot is a new one it may
            not be on the records yet — you can still trace it or type the
            dimensions in.
          </p>
        )}
        {process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY && (
          <p className="mt-2.5 max-w-2xl text-[13px] leading-relaxed text-ink/60">
            Put your address in and the tool can drop an aerial photo of the
            site behind your plan to trace over. It&apos;s a guide only — line
            it up with your lot yourself, remember the photo may be a year or
            two old, and it isn&apos;t a survey. It never appears on the
            printed plan.
          </p>
        )}
        <p className="mt-2.5 max-w-2xl text-[13px] leading-relaxed text-ink/60">
          If the boundary isn&apos;t right, take hold of it: <strong className="font-semibold">Adjust
          the boundary</strong> puts handles on every corner and every edge —
          drag a corner, drag a whole boundary, add one or take one out.{" "}
          <strong className="font-semibold">Trace the lot</strong>{" "}
          lays a new outline out corner by corner over the photo. Corners line up with
          each other and square themselves off as you go; hold Alt if
          you&apos;d rather they didn&apos;t, and Undo is always there. A
          boundary you draw or move is your own measurement rather than a
          survey, and the printed plan says exactly that.
        </p>
        <p className="mt-2.5 max-w-2xl text-[13px] leading-relaxed text-ink/60">
          Mark each structure{" "}
          <strong className="font-semibold">existing</strong> or{" "}
          <strong className="font-semibold">proposed</strong> — the drawing shows
          the difference in a way that survives a black-and-white printer, and
          the sheet labels every structure either way. Select one and the tool
          measures the gap to whatever sits near it, outline to outline. Tap a
          figure to pin it and it stays on the drawing and prints, alongside each
          proposed structure&apos;s distance to the existing ones nearest it. The
          tool measures and labels; whether a distance is enough is judged during
          assessment.
        </p>
        <p className="mt-2.5 max-w-2xl text-[13px] leading-relaxed text-ink/60">
          Printed your plan? It goes in the drawings bucket when you{" "}
          <Link href="/submit" className="font-medium text-seal underline underline-offset-2">
            lodge a job</Link>.
        </p>
      </div>
      <SitePlanBuilder companyId={session.companyId} cadastre={CADASTRE_READY} />
    </AppShell>
  );
}
