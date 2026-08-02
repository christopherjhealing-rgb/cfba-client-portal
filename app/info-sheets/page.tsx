import { redirect } from "next/navigation";
import { getClientSession } from "@/lib/session";
import { unreadCount } from "@/lib/unread";
import { AppShell, PageHead } from "@/components/AppShell";
import { disabledPages, hiddenHrefs } from "@/lib/pages";
import { PageOffline } from "@/components/PageOffline";
import { Icon, type IconName } from "@/components/Icon";

export const dynamic = "force-dynamic";

interface Sheet {
  no: string; // matches the number printed on the note itself
  title: string;
  blurb: string;
  file: string;
}

// Every note listed here is published. Masters live in
// docs/collateral/site-notes; render with render-site-notes.mjs, or supersede
// any note from /admin without a deploy.
const GROUPS: { group: string; icon: IconName; sheets: Sheet[] }[] = [
  {
    group: "Getting a Job Through First Time",
    icon: "check",
    sheets: [
      { no: "07", title: "Lodging Checklist",
        blurb: "Everything we need, by job type — check it before you send.",
        file: "/api/notes/CFBA-note-07-lodging-checklist.pdf" },
      { no: "01", title: "What Your Site Plan Needs to Show",
        blurb: "The single most common reason a job comes back to you.",
        file: "/api/notes/CFBA-note-site-plans.pdf" },
      { no: "05", title: "Elevations — What Yours Need to Show",
        blurb: "Every dimension we have to check, on the drawing itself.",
        file: "/api/notes/CFBA-note-elevations.pdf" },
      { no: "02", title: "Engineering Certification — What We Look For",
        blurb: "Usually one element missing, rather than the whole document.",
        file: "/api/notes/CFBA-note-engineering.pdf" },
    ],
  },
  {
    group: "Getting the Tricky Ones Right",
    icon: "alert",
    sheets: [
      { no: "14", title: "Planning Approval and Class 10",
        blurb: "Why a certified job can still stall at the council, and how to know early.",
        file: "/api/notes/CFBA-note-14-planning-class10.pdf" },
      { no: "03", title: "BAL Ratings — When You Need One",
        blurb: "Bushfire attack level assessments for Class 10a work.",
        file: "/api/notes/CFBA-note-bal.pdf" },
      { no: "04", title: "Retaining Walls — What to Send",
        blurb: "The four things these come back for, nearly every time.",
        file: "/api/notes/CFBA-note-retaining.pdf" },
      { no: "08", title: "Building on or Near a Boundary",
        blurb: "Sheds, carports and boundary walls — the 900 mm rule and what to show.",
        file: "/api/notes/CFBA-note-08-boundaries.pdf" },
      { no: "09", title: "Swimming Pool and Spa Barriers",
        blurb: "Barrier heights, gates, climbable zones and what the plans must show.",
        file: "/api/notes/CFBA-note-09-pool-barriers.pdf" },
      { no: "10", title: "Wind Class and Site Classification",
        blurb: "What determines them, and why the engineering depends on both.",
        file: "/api/notes/CFBA-note-10-wind-site.pdf" },
    ],
  },
  {
    group: "Site and Services",
    icon: "folder",
    sheets: [
      { no: "11", title: "Stormwater and Soak Wells",
        blurb: "Placement, clearances, and how discharge is shown on the plan.",
        file: "/api/notes/CFBA-note-11-stormwater.pdf" },
      { no: "12", title: "Easements, Sewer and Drainage",
        blurb: "Building over or near them, and who needs to agree first.",
        file: "/api/notes/CFBA-note-12-easements-sewer.pdf" },
    ],
  },
  {
    group: "After the Certificate",
    icon: "book",
    sheets: [
      { no: "13", title: "After Your Permit Is Issued",
        blurb: "Amendments, the completion notice, and keeping the approval valid.",
        file: "/api/notes/CFBA-note-13-after-permit.pdf" },
      { no: "06", title: "Amending a Job That's Already with Us",
        blurb: "When a change needs a fresh certificate, and what to send.",
        file: "/api/notes/CFBA-note-06-amendments.pdf" },
    ],
  },
];

export default async function InfoSheets() {
  const session = await getClientSession();
  if (!session) redirect("/");
  const unread = await unreadCount(session.companyId);

  const published = GROUPS.flatMap((g) => g.sheets).length;

  const hidden = await disabledPages();

  if (hidden.has("infoSheets")) {
    return (
      <AppShell company={session.companyName} impersonated={session.impersonated} unread={unread} hidden={hiddenHrefs(hidden)}>
        <PageOffline section="Info Sheets" />
      </AppShell>
    );
  }

  return (
    <AppShell company={session.companyName} impersonated={session.impersonated} unread={unread} hidden={hiddenHrefs(hidden)}>
      <PageHead
        hero="/heroes/patio.jpg"
        title="Info Sheets"
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
              <SheetCard key={s.no} sheet={s} icon={g.icon} />
            ))}
          </div>
        </section>
      ))}

      <p className="mt-2 text-[12px] text-ink/55">
        All {published} notes are available now. If a topic would help that isn&apos;t
        covered here, ask and we&apos;ll write it.
      </p>
    </AppShell>
  );
}

function SheetCard({ sheet, icon }: { sheet: Sheet; icon: IconName }) {
  return (
    <a href={sheet.file} target="_blank" rel="noopener noreferrer"
      className="card px-4 py-3.5 transition hover:border-seal/40 hover:bg-wash/40">
      <div className="flex items-start gap-3.5">
        <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-seal text-white">
          <Icon name={icon} size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[14px] font-semibold leading-snug text-ink">
            {sheet.title}
          </p>
          <p className="mt-1 text-[13px] leading-snug text-ink/55">{sheet.blurb}</p>
        </div>
        <span className="mt-0.5 shrink-0 text-seal"><Icon name="download" size={16} /></span>
      </div>
    </a>
  );
}
