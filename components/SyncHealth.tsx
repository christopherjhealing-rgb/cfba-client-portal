import Link from "next/link";

interface LastSync {
  at?: string; ok?: boolean; error?: string;
  issuedSeen?: number; filesCopied?: number; jobsUpserted?: number;
  messagesPulled?: number; filesPurged?: number;
  unmatched?: { ref: string; client: string }[];
  issuedNoFiles?: string[]; stillSyncing?: string[]; holding?: string[];
  emailsSent?: number; emailFails?: string[]; boardWriteFails?: string[];
  cardFails?: string[]; markedStuck?: string[]; noCertificate?: string[];
}

function ago(iso?: string): string {
  if (!iso) return "never";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  return `${Math.floor(h / 24)} day${Math.floor(h / 24) === 1 ? "" : "s"} ago`;
}

export function SyncHealth({ last }: { last: LastSync | null }) {
  const stale = last?.at
    ? Date.now() - new Date(last.at).getTime() > 60 * 60 * 1000
    : true;
  const failed = last && last.ok === false;

  // Distinct unmatched spellings — the list and its controls now live on
  // /admin/unmatched; here it's just a one-line alert so a card reaching
  // nobody is never invisible on the home queue.
  const unmatchedCount = new Set((last?.unmatched || []).map((u) => u.client)).size;

  const bannerClass = failed
    ? "border-flag/40 bg-[#FBECEC] text-flag"
    : stale
    ? "border-brass/40 bg-[#FBF4E6] text-brass"
    : "border-seal/30 bg-[#EDF3EE] text-seal";

  return (
    <div className="mb-8">
      <div className={`rounded-lg border px-4 py-3 text-[13px] ${bannerClass}`}>
        {failed ? (
          <><strong>Last sync failed</strong> {ago(last?.at)} — {last?.error}</>
        ) : stale ? (
          <><strong>Sync is stale</strong> — last ran {ago(last?.at)}. Check Vercel cron and the Monday token.</>
        ) : (
          <><strong>Sync healthy</strong> — {ago(last?.at)} · {last?.jobsUpserted ?? 0} jobs,
            {" "}{last?.filesCopied ?? 0} files, {last?.messagesPulled ?? 0} messages
            {(last?.emailsSent ?? 0) > 0 ? `, ${last?.emailsSent} issued email${(last?.emailsSent ?? 0) === 1 ? "" : "s"} sent` : ""}
            {(last?.filesPurged ?? 0) > 0 ? `, ${last?.filesPurged} purged` : ""}</>
        )}
      </div>

      {(last?.holding?.length ?? 0) > 0 && (
        <div className="mt-3 rounded-lg border border-seal/30 bg-[#EDF3EE] px-4 py-3 text-[13px] text-seal">
          <strong>In the issue hold</strong> —{" "}
          <span className="font-mono">{last?.holding?.join(", ")}</span>{" "}
          went to Issued in the last few minutes. Files pull and the client
          email goes once the hold passes. <strong>Change of mind?</strong> Pull
          the card back off Issued before then and the client never hears a
          thing.
        </div>
      )}

      {(last?.stillSyncing?.length ?? 0) > 0 && (
        <div className="mt-3 rounded-lg border border-seal/30 bg-[#EDF3EE] px-4 py-3 text-[13px] text-seal">
          <strong>OneDrive still syncing</strong> — the Issued folder for{" "}
          <span className="font-mono">{last?.stillSyncing?.join(", ")}</span>{" "}
          changed in the last few minutes, so the portal is waiting for it to
          finish rather than deliver a half-synced package. It pulls the files
          and sends the email automatically once the folder goes quiet.
        </div>
      )}

      {(last?.issuedNoFiles?.length ?? 0) > 0 && (
        <div className="mt-3 rounded-lg border border-brass/40 bg-[#FBF4E6] px-4 py-3 text-[13px] text-brass">
          <strong>Issued on Monday, but no files found</strong> — the certificate
          isn&apos;t downloadable and no email has gone for:{" "}
          <span className="font-mono">{last?.issuedNoFiles?.join(", ")}</span>.
          Put the package in the job&apos;s SharePoint folder; the next sync picks
          it up and sends the email.
        </div>
      )}

      {(last?.noCertificate?.length ?? 0) > 0 && (
        <div className="mt-3 rounded-lg border border-flag/40 bg-[#FBECEC] px-4 py-3 text-[13px] text-flag">
          <strong>No Certificate in the Package</strong> — these have files, but
          none of them is a <span className="font-mono">CDC…pdf</span>:{" "}
          {last?.noCertificate?.join(", ")}. The autogen leaves the CDC as a Word
          file and nothing converts it, so the PDF only exists once somebody
          exports it. Check the Issued folder before the client downloads.
        </div>
      )}

      {(last?.cardFails?.length ?? 0) > 0 && (
        <div className="mt-3 rounded-lg border border-flag/40 bg-[#FBECEC] px-4 py-3 text-[13px] text-flag">
          <strong>Jobs This Sync Couldn&apos;t Finish</strong> — the rest of the run
          carried on without them, so nothing else is held up, but the portal
          hasn&apos;t got these: {last?.cardFails?.join("; ")}. Check the job&apos;s
          Issued folder — a locked, empty or unreadable file is the usual cause.
        </div>
      )}

      {(last?.markedStuck?.length ?? 0) > 0 && (
        <div className="mt-3 rounded-lg border border-flag/40 bg-[#FBECEC] px-4 py-3 text-[13px] text-flag">
          <strong>Flagged STUCK on the Board</strong> — the PORTAL column now
          reads STUCK for: {last?.markedStuck?.join(", ")}. Each is issued and
          the client still can&apos;t get it. Fix the cause and the portal
          clears the flag itself on the next run.
        </div>
      )}

      {(last?.emailFails?.length ?? 0) > 0 && (
        <div className="mt-3 rounded-lg border border-flag/40 bg-[#FBECEC] px-4 py-3 text-[13px] text-flag">
          <strong>Issued email didn&apos;t send</strong> — the job is downloadable
          in the portal, but the client wasn&apos;t told:{" "}
          {last?.emailFails?.join("; ")}. Fix the cause (client email address /
          mailbox), then tell the client yourself — this email won&apos;t retry.
        </div>
      )}

      {(last?.boardWriteFails?.length ?? 0) > 0 && (
        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
          <strong>Board Not Updated</strong> — these jobs are fine for the
          client, but Monday&apos;s <em>PORTAL</em> column doesn&apos;t show
          where they&apos;re up to: {last?.boardWriteFails?.join("; ")}. Set it
          by hand so nobody chases a job that already went.
        </div>
      )}

      {unmatchedCount > 0 && (
        <Link
          href="/admin/unmatched"
          className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-flag/40 bg-[#FBECEC] px-4 py-3 text-[13px] text-flag transition hover:bg-[#f7dede]"
        >
          <span>
            <strong>{unmatchedCount} unmatched Monday client{unmatchedCount === 1 ? "" : "s"}</strong>
            {" "}— their jobs and messages are reaching nobody until matched.
          </span>
          <span className="shrink-0 font-semibold underline">Match them →</span>
        </Link>
      )}
    </div>
  );
}
