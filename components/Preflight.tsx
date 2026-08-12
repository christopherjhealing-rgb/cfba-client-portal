import { env, DEMO_MODE, GRAPH_READY, MONDAY_READY } from "@/lib/env";

// P0-1 made mechanical: the go-live pre-flight as one read-only card.
// Presence and pass/fail ONLY — no value, secret or otherwise, is ever
// rendered. Collapsed to a single line day-to-day; the owner expands it
// once, works down the list, and gives out no URL until it's green.

type State = "pass" | "attention" | "info" | "manual";
type Check = { name: string; state: State; hint: string };

function checks(): Check[] {
  const authSecret = process.env.AUTH_SECRET || "";
  const authOk = authSecret.length >= 32 && authSecret !== "dev-only-insecure-secret-change-me";
  const passcodeOk = !!process.env.STAFF_PASSCODE && env.staffPasscode !== "demo";
  const mailVia = env.mailFrom ? "Graph mailbox" : process.env.RESEND_API_KEY ? "Resend" : "";
  const appUrlLocal = env.appUrl.startsWith("http://localhost");

  return [
    {
      name: "Data store",
      state: DEMO_MODE ? "attention" : "pass",
      hint: DEMO_MODE
        ? "running on the built-in demo store — fine for a dry run, never for a client. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
        : "Supabase configured — demo mode off.",
    },
    {
      name: "Session secret",
      state: authOk ? "pass" : "attention",
      hint: authOk
        ? "AUTH_SECRET is set, non-default, 32+ characters."
        : "AUTH_SECRET is unset, the dev default, or under 32 characters — generate a fresh one.",
    },
    {
      name: "Staff passcode",
      state: passcodeOk ? "pass" : "attention",
      hint: passcodeOk
        ? "STAFF_PASSCODE is set and isn't the demo default."
        : "STAFF_PASSCODE is unset or still “demo” — anyone who reads the runbook could sign in here.",
    },
    {
      name: "Cron secret",
      state: process.env.CRON_SECRET ? "pass" : "attention",
      hint: process.env.CRON_SECRET
        ? "CRON_SECRET is set — sync, evening report and digest runs can authorise."
        : "CRON_SECRET is unset — the scheduled sync and 5pm report can't run.",
    },
    {
      name: "Monday board",
      state: MONDAY_READY ? "pass" : "attention",
      hint: MONDAY_READY
        ? "MONDAY_TOKEN is present."
        : "MONDAY_TOKEN is unset — lodgements queue instead of reaching the board, and sync can't run.",
    },
    {
      name: "SharePoint (Graph)",
      state: GRAPH_READY ? "pass" : "attention",
      hint: GRAPH_READY
        ? "tenant, client and secret all present."
        : "GRAPH_TENANT_ID / GRAPH_CLIENT_ID / GRAPH_CLIENT_SECRET incomplete — issued packages can't be pulled.",
    },
    {
      name: "Email out",
      state: mailVia ? "pass" : "attention",
      hint: mailVia
        ? `${mailVia} configured — notifications and login emails can send.`
        : "neither MAIL_FROM (Graph) nor RESEND_API_KEY is set — no email leaves the portal.",
    },
    {
      name: "Public address",
      state: appUrlLocal ? "attention" : "pass",
      hint: appUrlLocal
        ? "APP_URL resolves to localhost — every emailed link would point nowhere. Set it to the live domain."
        : "APP_URL (or the deployment's own address) is set — emailed links have somewhere to go.",
    },
    {
      name: "Maps key",
      state: process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ? "info" : "attention",
      hint: process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY
        ? "present — confirm the referrer restriction by hand (below)."
        : "NEXT_PUBLIC_GOOGLE_MAPS_KEY is unset — the site plan tool's map won't load.",
    },
    {
      name: "Bushfire lookup",
      state: "info",
      hint: env.bushfireEnabled
        ? "on — lodgement addresses are checked against the DFES prone-area map."
        : "off (BUSHFIRE_ENABLED) — the BAL prompt stays quiet. Deliberate until switched on.",
    },
  ];
}

// What a server can't see about itself — the by-hand confirms that complete
// P0-1. Listed here so the owner works ONE list, not two.
const MANUAL: Check[] = [
  { name: "Issued bucket", state: "manual", hint: "Supabase → Storage → issued: private, RLS enabled. Confirm in the dashboard; change nothing." },
  { name: "Maps referrer", state: "manual", hint: "Google Cloud console: key restricted to the live domain." },
  { name: "Cron registered", state: "manual", hint: "Vercel → Cron: sync + report jobs exist and a run has genuinely fired." },
  { name: "Domain + HTTPS", state: "manual", hint: "the custom domain resolves and serves the portal over HTTPS." },
];

const CHIP: Record<State, [string, string]> = {
  pass: ["chip-seal", "PASS"],
  attention: ["chip-brass", "ATTEND"],
  info: ["", "INFO"],
  manual: ["", "BY HAND"],
};

export function Preflight() {
  const auto = checks();
  const gated = auto.filter((c) => c.state !== "info");
  const green = gated.filter((c) => c.state === "pass").length;
  const allGreen = green === gated.length;

  return (
    <details className="card mb-6 px-4 py-3">
      <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 text-[13px] marker:content-none">
        <span className={`chip ${allGreen ? "chip-seal" : "chip-brass"}`}>
          {allGreen ? "Pre-flight green" : "Pre-flight"}
        </span>
        <span className="font-medium text-ink">
          Go-live pre-flight — {green} of {gated.length} checks green
        </span>
        <span className="text-ink/60">
          {DEMO_MODE ? "Demo mode, so ambers are expected here. " : ""}Expand to work the list.
        </span>
      </summary>
      <div className="mt-3 divide-y divide-rule border-t border-rule">
        {[...auto, ...MANUAL].map((c) => (
          <div key={c.name} className="flex items-baseline gap-3 py-2 text-[13px]">
            <span className={`chip shrink-0 ${CHIP[c.state][0]}`}>{CHIP[c.state][1]}</span>
            <span className="w-36 shrink-0 font-medium text-ink">{c.name}</span>
            <span className="text-ink/70">{c.hint}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[12px] text-ink/60">
        Presence checks only — no value is shown or sent anywhere. The full walk-through
        is docs/GO-LIVE-RUNBOOK.md; don&apos;t give a client the URL until this reads
        green and the go/no-go list is ticked.
      </p>
    </details>
  );
}
