import { STAGES, stageStates } from "@/lib/core.mjs";
import type { PortalJob } from "@/lib/core.d.mts";

type State = "done" | "current" | "waiting" | "skipped" | "paused" | "pending";

const DOT: Record<State, string> = {
  done: "bg-seal border-seal text-white",
  current: "bg-seal border-seal text-white ring-4 ring-seal/15",
  waiting: "bg-brass border-brass text-white ring-4 ring-brass/15",
  paused: "bg-white border-ink/30 text-ink/40",
  skipped: "bg-white border-rule text-ink/25",
  pending: "bg-white border-rule text-ink/25",
};

const LABEL: Record<State, string> = {
  done: "text-ink/55",
  current: "text-ink font-semibold",
  waiting: "text-brass font-semibold",
  paused: "text-ink/50 font-semibold",
  skipped: "text-ink/30",
  pending: "text-ink/35",
};

/** Progress across the five client-facing stages. No dates by design: the
 *  stepper says where a job is, not when it will move. */
export function JobTimeline({ job }: { job: PortalJob }) {
  const states = stageStates(job) as State[];

  return (
    <ol className="flex w-full items-start" aria-label="Job progress">
      {STAGES.map((stage, i) => {
        const state = states[i];
        const filled = state === "done" || state === "current" || state === "waiting";
        return (
          <li key={stage.key} className="relative flex min-w-0 flex-1 flex-col items-center">
            {i > 0 && (
              <span aria-hidden="true"
                className={`absolute right-1/2 top-[9px] h-[2px] w-full ${
                  states[i - 1] === "done" || states[i - 1] === "skipped"
                    ? "bg-seal/45" : "bg-rule"}`} />
            )}
            <span
              className={`relative z-10 grid h-[19px] w-[19px] place-items-center rounded-full border-2 ${DOT[state]}`}
            >
              {state === "done" && (
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
            <span className={`mt-1.5 px-1 text-center text-[10px] leading-tight ${LABEL[state]}`}>
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
