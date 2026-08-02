import { env } from "@/lib/env";
import { Icon } from "./Icon";

const DAYS = String(env.turnaroundDays).replace("-", "\u2013");

/** The short line, for the dashboard and the lodge form. */
export function TurnaroundLine({ className = "" }: { className?: string }) {
  return (
    <p className={`text-[13px] leading-relaxed text-ink/60 ${className}`}>
      Most jobs are certified within about{" "}
      <span className="font-medium text-ink/80">{DAYS} business days</span>{" "}
      of everything being received. We don&apos;t put a date on individual jobs —{" "}
      <span className="whitespace-nowrap">here&apos;s why.</span>
    </p>
  );
}

/** The full explanation. Lives on Help & support, and is the thing the short
 *  line points at. Written to be read by someone who is in a hurry, so it
 *  leads with what it costs them rather than with what we're entitled to. */
export function TurnaroundNote() {
  return (
    <div className="card p-5">
      <div className="flex items-start gap-3.5">
        <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-wash text-seal">
          <Icon name="clock" size={17} />
        </span>
        <div className="min-w-0">
          <p className="font-display text-[15px] font-semibold text-ink">
            How long a job takes
          </p>
          <div className="mt-2 space-y-2.5 text-[14px] leading-relaxed text-ink/70">
            <p>
              Most jobs are certified within about{" "}
              <span className="font-medium text-ink">{DAYS} business days</span>{" "}
              of us having everything we need. The clock starts when the last
              document arrives — not when the job is first lodged.
            </p>
            <p>
              We don&apos;t give a date for an individual job. A certificate of
              design compliance is signed by a registered building surveyor who
              carries the responsibility for it, and the quickest route to a permit
              is an application that is right the first time.
            </p>
            <p>
              A certificate that has to be corrected, or that comes back from the
              permit authority, costs weeks — far more than any assessment saves.
              Taking the time to get it right is the fastest way to get you built.
            </p>
            <p>
              If a job is genuinely time-critical, tell us when you lodge it rather
              than after. We&apos;ll tell you honestly what&apos;s possible, and
              lodging complete is the single biggest thing that speeds a job up.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
