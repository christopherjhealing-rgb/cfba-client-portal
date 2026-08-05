import { Icon } from "./Icon";
import { fmtDate } from "@/lib/when.mjs";

// Perth-zoned and Invalid-Date-safe — see lib/when. Re-exported here because
// this is where the rest of the app already imports fmtDate from.
export { fmtDate };

/**
 * When a job was lodged, and how long ago.
 *
 * One component so the dashboard and My Jobs can't drift into two different
 * answers to the same question. Business days rather than calendar days,
 * because that's the unit everything else in the portal counts in — "3–4
 * business days" is the promise on the dashboard, and a Friday lodgement
 * showing "3 days" on the Monday would read as though we'd sat on it over
 * the weekend.
 *
 * Falls back to nothing at all when there's no received date. A job that
 * arrived before the portal did has no lodgement stamp, and "Lodged —" is
 * worse than silence.
 */
export function LodgedLine({
  receivedAt, days, className = "",
}: {
  receivedAt?: string | null;
  /** Business days since, already worked out by the page. */
  days?: number | null;
  className?: string;
}) {
  const when = fmtDate(receivedAt);
  if (!when) return null;
  return (
    <div className={`text-[12px] text-ink/50 ${className}`}>
      Lodged {when}
      {typeof days === "number" && days >= 0 && (
        <> · <span className="text-ink/65">
          {days === 0 ? "today" : `${days} business day${days === 1 ? "" : "s"} ago`}
        </span></>
      )}
    </div>
  );
}

export function SectionHead({
  title,
  count,
  tone = "plain",
}: {
  title: string;
  count?: number;
  tone?: "plain" | "amber";
}) {
  return (
    <div className="sectionhead">
      <span className={tone === "amber" ? "text-brass-deep" : undefined}>{title}</span>
      <span className="h-px flex-1 bg-rule" />
      {count !== undefined && (
        <span className={`font-mono text-[12px] ${tone === "amber" ? "text-brass-deep" : "text-ink/45"}`}>
          {count}
        </span>
      )}
    </div>
  );
}

/** A job line with the green edge marker used for anything downloadable. */
export function ReadyRow({
  refNo,
  address,
  meta,
  action,
}: {
  refNo: string;
  address: string;
  meta: string;
  action: React.ReactNode;
}) {
  return (
    <div className="relative flex flex-wrap items-center gap-4 px-4 py-3.5 pl-5">
      <span
        aria-hidden="true"
        className="absolute left-0 top-0 h-full w-[3px] bg-seal"
      />
      {/* min-w keeps the line readable on phones — the action wraps below
          instead of crushing the words. */}
      <div className="min-w-[170px] max-w-full flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="font-mono text-[12px] text-ink/55">{refNo}</span>
          <span className="truncate font-medium text-ink">{address}</span>
        </div>
        <div className="mt-0.5 truncate text-[13px] text-ink/55">{meta}</div>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="card px-6 py-12 text-center">
      <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-wash text-seal">
        <Icon name="folder" size={22} />
      </div>
      <p className="font-display text-[16px] font-semibold">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-[13px] text-ink/55">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
