import Link from "next/link";
import { redirect } from "next/navigation";
import { isStaff } from "@/lib/session";
import { DEMO_MODE, GRAPH_READY, MONDAY_READY, env } from "@/lib/env";
import * as repo from "@/lib/repo";
import { StaffShell } from "@/components/StaffShell";
import { PageToggles } from "@/components/PageToggles";
import { TOGGLEABLE_PAGES } from "@/lib/pages";
import { LoginDesignToggle } from "@/components/LoginDesignToggle";
import { DailyReportCard } from "@/components/DailyReportCard";
import { TeamsCard } from "@/components/TeamsCard";
import { AmendmentRouting } from "@/components/AmendmentRouting";
import { getAmendmentConfig } from "@/lib/amendments";
import { getTeamsConfig, getTeamsLast, TEAMS_EVENTS } from "@/lib/teams";
import { AppUrlCard } from "@/components/AppUrlCard";
import { resolveAppUrl, storedAppUrl } from "@/lib/appurl";

export const dynamic = "force-dynamic";

/** How the portal is wired and what's switched on. Set once, revisited rarely —
 *  which is exactly why it doesn't belong on the page opened every morning. */
export default async function SettingsPage() {
  if (!(await isStaff())) redirect("/admin/login");

  const [disabled, loginDesign, lastReport, teams, teamsLast, amendments, liveUrl, storedUrl] =
    await Promise.all([
      repo.disabledPages(),
      repo.getSetting<{ design?: string }>("login_design").catch(() => null),
      repo.getSetting<{ at?: string; ok?: boolean; error?: string }>("last_report").catch(() => null),
      getTeamsConfig(),
      getTeamsLast(),
      getAmendmentConfig(),
      resolveAppUrl(),
      storedAppUrl(),
    ]);

  return (
    <StaffShell title="Settings" sub="How the portal is wired, and what's switched on." active="/admin/settings">
      <Link href="/admin" className="text-[13px] text-seal underline">← Back to Admin</Link>

      {/* First on the page. It is the setting most likely to be quietly wrong
          and the one with the worst consequence when it is. */}
      <div className="mt-4">
        <AppUrlCard live={liveUrl} stored={storedUrl} fallback={env.appUrl} />
      </div>

      <div className="mb-8 mt-8">
        <h2 className="mb-2.5 font-display text-[12px] font-semibold uppercase tracking-[0.15em] text-ink/70">
          Connections
        </h2>
        <div className="card divide-y divide-rule text-[13px]">
          <Row label="Data Store" value={DEMO_MODE ? "Demo (no Supabase configured)" : "Supabase"} warn={DEMO_MODE} />
          <Row label="Monday Board" value={MONDAY_READY ? `Connected · ${env.mondayBoardId}` : "No MONDAY_TOKEN set"} warn={!MONDAY_READY} />
          <Row label="SharePoint (Graph)" value={GRAPH_READY ? "Connected" : "No Graph credentials set"} warn={!GRAPH_READY} />
          <Row label="Sending Mailbox" value={env.mailFrom || "No MAIL_FROM set"} warn={!env.mailFrom} />
          <Row label="Office Inbox" value={env.officeEmail || "No OFFICE_EMAIL set"} warn={!env.officeEmail} />
          <Row label="Retention" value={`${env.retentionMonths} months from first download`} />
          <Row
            label="Correspondence Record"
            value={env.recordEmailEnabled
              ? `Emailed to ${env.officeEmail || "— no OFFICE_EMAIL set"} when a client downloads their package. Jobs with no messages send nothing.`
              : "Off — nothing is filed automatically. Export by hand from Records."}
            warn={env.recordEmailEnabled && !env.officeEmail}
          />
          <Row label="Issue Hold" value={`${env.issueHoldMinutes} minutes before a client is told`} />
          <Row
            label="Certificate Check"
            value={env.requireCertificate
              ? `On — a package with no ${env.certificatePrefix}…pdf is held back`
              : `Reporting only — a missing ${env.certificatePrefix}…pdf is flagged, not blocked`}
            warn={!env.requireCertificate}
          />
        </div>
      </div>

      <DailyReportCard
        enabled={env.dailyReportEnabled}
        to={env.officeEmail}
        cronSecretSet={!!process.env.CRON_SECRET}
        mailFromSet={!!env.mailFrom}
        last={lastReport}
      />

      <TeamsCard
        initial={teams}
        events={TEAMS_EVENTS.map((e) => ({ key: e.key, label: e.label, detail: e.detail }))}
        last={teamsLast}
      />

      <AmendmentRouting
        initial={amendments}
        knownNames={["Chris Healing", "Rebecca Creighan"]}
      />

      <PageToggles
        pages={TOGGLEABLE_PAGES.map((p) => ({ key: p.key, label: p.label }))}
        initialDisabled={[...disabled]}
      />

      <LoginDesignToggle initial={loginDesign?.design === "classic" ? "classic" : "new"} />
    </StaffShell>
  );
}

function Row({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5">
      <span className="text-ink/55">{label}</span>
      <span className={warn ? "text-brass" : "text-ink/80"}>{value}</span>
    </div>
  );
}
