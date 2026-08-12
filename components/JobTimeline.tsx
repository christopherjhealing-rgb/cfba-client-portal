import { STAGES, stageStates } from "@/lib/core.mjs";
import type { PortalJob } from "@/lib/core.d.mts";

type State = "done" | "current" | "waiting" | "skipped" | "paused" | "pending";

const DOT: Record<State, string> = {
  done: "bg-seal border-seal text-white",
  current: "bg-seal border-seal text-white ring-4 ring-seal/15",
  waiting: "bg-brass border-brass text-white ring-4 ring-brass/15",
  paused: "bg-white border-ink/30 text-ink/60",
  skipped: "bg-white border-rule text-ink/25",
  pending: "bg-white border-rule text-ink/25",
};

// State reads first from the dot (tick / ring / empty); the label weight and
// tone are the second cue. Kept legible — the whole point of the stepper is to
// see what's coming — with the hierarchy carried by current's weight rather
// than by fading the future past readability. current (bold ink) > done (/60) >
// pending (/50, still to come) > skipped (/45, not required for this job).
const LABEL: Record<State, string> = {
  done: "text-ink/60",
  current: "text-ink font-semibold",
  waiting: "text-brass-deep font-semibold",
  paused: "text-ink/60 font-semibold",
  skipped: "text-ink/60",
  pending: "text-ink/60",
};

/** Progress across the five client-facing stages. No dates by design: the
 *  stepper says where a job is, not when it will move.
 *
 *  Two layouts from one markup. From lg up it is the horizontal stepper it has
 *  always been, unchanged — that is the desktop this portal is mostly read on.
 *  Below lg the five labels cannot sit side by side: at 390px each column is
 *  about 62px, and "Under assessment", "Further information" and "Certificate
 *  being prepared" wrapped into one another into an unreadable smudge. So
 *  below lg it turns vertical — one stage per row, at a readable size, every
 *  stage still named. Shortening the labels or naming only the current stage
 *  would both have cost the client the thing the stepper is for: seeing what
 *  is coming next. */
export function JobTimeline({ job }: { job: PortalJob }) {
  const states = stageStates(job) as State[];

  return (
    <ol className="relative flex w-full flex-col gap-3 lg:flex-row lg:items-start lg:gap-0"
      aria-label="Job progress">
      {/* The vertical rail, below lg only: one element behind all five dots
          rather than five pieces of per-row geometry that a wrapped label
          would pull out of true. The dots are opaque and sit over it. */}
      <span aria-hidden="true"
        className="absolute bottom-[10px] left-[9px] top-[10px] w-[2px] -translate-x-1/2 bg-rule lg:hidden" />
      {STAGES.map((stage, i) => {
        const state = states[i];
        const filled = state === "done" || state === "current" || state === "waiting";
        return (
          <li key={stage.key}
            className="relative z-10 flex items-center gap-3 lg:min-w-0 lg:flex-1 lg:flex-col lg:items-center lg:gap-0">
            {i > 0 && (
              <span aria-hidden="true"
                className={`absolute right-1/2 top-[9px] hidden h-[2px] w-full lg:block ${
                  states[i - 1] === "done" || states[i - 1] === "skipped"
                    ? "bg-seal/45" : "bg-rule"}`} />
            )}
            <span
              className={`relative z-10 grid h-[19px] w-[19px] shrink-0 place-items-center rounded-full border-2 ${DOT[state]}`}
            >
              {/* The last stage being "current" means the job has arrived, not
                  that it's mid-flight — Issued deserves its tick like every
                  step before it. */}
              {(state === "done" || (state === "current" && i === states.length - 1)) && (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              )}
              {state === "skipped" && (
                <span className="h-[2px] w-[7px] rounded bg-current" aria-hidden="true" />
              )}
              {state === "waiting" && (
                <span className="text-[10px] font-bold leading-none" aria-hidden="true">!</span>
              )}
            </span>
            <span className={`text-[13.5px] leading-tight lg:mt-1.5 lg:px-1 lg:text-center lg:text-[10px] ${LABEL[state]}`}>
              {stage.label}
            </span>
            <span className="sr-only">
              {state === "done" ? "complete"
                : state === "current" ? "current stage"
                : state === "waiting" ? "with you"
                : state === "skipped" ? "not required"
                : state === "paused" ? "on hold"
                : "not started"}
            </span>
            {!filled && state !== "skipped" && <span className="sr-only">pending</span>}
          </li>
        );
      })}
    </ol>
  );
}
