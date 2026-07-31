import { Icon } from "./Icon";

export function fmtDate(d?: string | null) {
  if (!d) return null;
  return new Date(d).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
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
      <span className={tone === "amber" ? "text-brass" : undefined}>{title}</span>
      <span className="h-px flex-1 bg-rule" />
      {count !== undefined && (
        <span className={`font-mono text-[12px] ${tone === "amber" ? "text-brass" : "text-ink/45"}`}>
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
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="font-mono text-[12px] text-ink/45">{refNo}</span>
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
