import { redirect } from "next/navigation";
import { getClientSession } from "@/lib/session";
import { unreadCount } from "@/lib/unread";
import { AppShell, PageHead } from "@/components/AppShell";
import { disabledPages, hiddenHrefs } from "@/lib/pages";
import { PageOffline } from "@/components/PageOffline";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

interface Sheet {
  no: string;
  title: string;
  blurb: string;
  file?: string;
}

// Published notes have a file. The rest are drafted but not written yet — they
// are listed so clients can see what's coming and ask for one early.
const GROUPS: { group: string; sheets: Sheet[] }[] = [
  {
    group: "Getting a job through first time",
    sheets: [
      { no: "07", title: "Lodging checklist",
        blurb: "Everything we need, by job type — check it before you send.",
        file: "/notes/CFBA-note-07-lodging-checklist.pdf" },
      { no: "01", title: "What your site plan needs to show",
        blurb: "The single most common reason a job comes back to you.",
        file: "/notes/CFBA-note-site-plans.pdf" },
      { no: "05", title: "Elevations — what yours need to show",
        blurb: "Every dimension we have to check, on the drawing itself.",
        file: "/notes/CFBA-note-elevations.pdf" },
      { no: "02", title: "Engineering certification — what we look for",
        blurb: "Usually one element missing, rather than the whole document.",
        file: "/notes/CFBA-note-engineering.pdf" },
    ],
  },
  {
    group: "Where the rules bite",
    sheets: [
      { no: "03", title: "BAL ratings — when you need one",
        blurb: "Bushfire attack level assessments for Class 10a work.",
        file: "/notes/CFBA-note-bal.pdf" },
      { no: "04", title: "Retaining walls — what to send",
        blurb: "The four things these come back for, nearly every time.",
        file: "/notes/CFBA-note-retaining.pdf" },
      { no: "06", title: "Fire separation and boundary setbacks",
        blurb: "Class 10a close to a boundary, and the 900 mm and 6 m rules." },
      { no: "07", title: "Swimming pool barriers",
        blurb: "Barrier heights, gates, climbable zones and what the plans must show." },
      { no: "08", title: "Wind region and site classification",
        blurb: "What determines them, and why the engineering depends on both." },
    ],
  },
  {
    group: "Site and services",
    sheets: [
      { no: "09", title: "Stormwater and soak wells",
        blurb: "Sizing, placement, and how discharge is shown on the plan." },
      { no: "10", title: "Easements, sewer and drainage",
        blurb: "Building over or near them, and who needs to agree first." },
      { no: "11", title: "Sheds and carports on a boundary",
        blurb: "Where they can sit, and what changes when they do." },
    ],
  },
  {
    group: "After the certificate",
    sheets: [
      { no: "12", title: "What happens after your permit is issued",
        blurb: "Inspections, notices, and keeping the approval valid." },
      { no: "06", title: "Amending a job that's already with us",
        blurb: "When a change needs a fresh certificate, and what to send.",
        file: "/notes/CFBA-note-06-amendments.pdf" },
    ],
  },
];

export default async function InfoSheets() {
  const session = await getClientSession();
  if (!session) redirect("/");
  const unread = await unreadCount(session.companyId);

  const published = GROUPS.flatMap((g) => g.sheets).filter((s) => s.file).length;

  const hidden = await disabledPages();

  if (hidden.has("infoSheets")) {
    return (
      <AppShell company={session.companyName} impersonated={session.impersonated} unread={unread} hidden={hiddenHrefs(hidden)}>
        <PageOffline section="Info sheets" />
      </AppShell>
    );
  }

  return (
    <AppShell company={session.companyName} impersonated={session.impersonated} unread={unread} hidden={hiddenHrefs(hidden)}>
      <PageHead
        title="Info sheets"
        sub="Short guidance notes on what we need and why jobs come back. Written from the requests we actually send."
      />

      {GROUPS.map((g) => (
        <section key={g.group} className="mb-8">
          <p className="sectionhead">
            <span>{g.group}</span>
            <span className="h-px flex-1 bg-rule" />
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {g.sheets.map((s) => (
              <SheetCard key={s.no} sheet={s} />
            ))}
          </div>
        </section>
      ))}

      <p className="mt-2 text-[12px] text-ink/45">
        {published} notes available now. The rest are on the way — if one would help
        on a job you have with us, ask and we&apos;ll send what we have.
      </p>
    </AppShell>
  );
}

function SheetCard({ sheet }: { sheet: Sheet }) {
  const body = (
    <>
      <div className="flex items-start gap-3.5">
        <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg font-mono text-[12px] font-semibold ${
          sheet.file ? "bg-seal text-white" : "bg-wash text-ink/35"}`}>
          {sheet.no}
        </span>
        <div className="min-w-0 flex-1">
          <p className={`font-display text-[14px] font-semibold leading-snug ${
            sheet.file ? "text-ink" : "text-ink/55"}`}>
            {sheet.title}
          </p>
          <p className="mt-1 text-[13px] leading-snug text-ink/55">{sheet.blurb}</p>
        </div>
        {sheet.file ? (
          <span className="mt-0.5 shrink-0 text-seal"><Icon name="download" size={16} /></span>
        ) : (
          <span className="mt-0.5 shrink-0 font-display text-[9px] font-semibold uppercase tracking-[0.12em] text-ink/35">
            Soon
          </span>
        )}
      </div>
    </>
  );

  if (!sheet.file) {
    return <div className="card px-4 py-3.5 opacity-70">{body}</div>;
  }
  return (
    <a href={sheet.file} target="_blank" rel="noopener noreferrer"
      className="card px-4 py-3.5 transition hover:border-seal/40 hover:bg-wash/40">
      {body}
    </a>
  );
}
