// Central config. Anything unset falls back to demo behaviour so the portal
// runs end-to-end with `npm run dev` before a single credential exists.

export const env = {
  supabaseUrl: process.env.SUPABASE_URL || "",
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  supabaseBucket: process.env.SUPABASE_BUCKET || "issued",

  authSecret: process.env.AUTH_SECRET || "dev-only-insecure-secret-change-me",
  staffPasscode: process.env.STAFF_PASSCODE || "demo",

  mondayToken: process.env.MONDAY_TOKEN || "",
  mondayBoardId: process.env.MONDAY_BOARD_ID || "7129862365",
  mondayNewGroup: process.env.MONDAY_NEW_GROUP || "topics",

  // The two rungs of the board's "Send?" column that the portal writes. These
  // labels are typed onto the board by a human, so their spelling lives here
  // rather than in code: if the column ends up reading "Ready to Download",
  // that's a Vercel setting away from working instead of a deploy.
  sendReadyLabel: process.env.SEND_READY_LABEL || "READY",
  sendDownloadedLabel: process.env.SEND_DOWNLOADED_LABEL || "DOWNLOADED",

  // The evening report to the office: everything that should have reached a
  // client today and didn't. Off until DAILY_REPORT_ENABLED=1. Sends to
  // OFFICE_EMAIL.
  dailyReportEnabled: process.env.DAILY_REPORT_ENABLED === "1",
  // A job the client hasn't opened after this many days gets a line in the
  // report. Not a failure on its own — it's how a dead email address shows up.
  unopenedAfterDays: Number(process.env.UNOPENED_AFTER_DAYS || "3"),

  // Lodgements go straight onto the board (default). Set to 0 to restore the
  // review queue; either way the queue still catches anything that can't
  // reach Monday at lodgement time.
  autoAcceptLodgements: (process.env.AUTO_ACCEPT_LODGEMENTS ?? "1") !== "0",

  // Weekly per-builder digest email. Off until DIGEST_ENABLED=1, so it can't
  // surprise 70+ builders before you've decided to switch it on.
  digestEnabled: process.env.DIGEST_ENABLED === "1",

  // Microsoft Graph (app-only). Site + drive were confirmed against the live
  // tenant; override per environment if the library ever moves.
  graphTenantId: process.env.GRAPH_TENANT_ID || "",
  graphClientId: process.env.GRAPH_CLIENT_ID || "",
  graphClientSecret: process.env.GRAPH_CLIENT_SECRET || "",
  graphDriveId:
    process.env.GRAPH_DRIVE_ID ||
    "b!oxbzU5lAQEKvJWYnAKhjupmCoJ2xMxdJmKNl5i9NqeWmThm8ndoDTa21nWz9VGAz",
  clientFilesRoot:
    process.env.GRAPH_CLIENT_FILES_ROOT ||
    "CF Building Approvals/CFBA Client Files",

  // Published as "most jobs within N business days of everything being
  // received". Check it against the real figures before changing it -
  // publishing a number you miss creates the pressure it was meant to remove.
  // Mailbox notifications are sent from. Needs Mail.Send on the Graph app.
  mailFrom: process.env.MAIL_FROM || "",
  // Where client-reply notifications land. Set to a watched inbox
  // (e.g. admin@cfba.com.au); falls back to the sending mailbox.
  officeEmail: process.env.OFFICE_EMAIL || process.env.MAIL_FROM || "",
  turnaroundDays: process.env.TURNAROUND_DAYS || "3-4",
  retentionMonths: Number(process.env.RETENTION_MONTHS || "3"),
  // Minutes a card must sit at Issued before the portal pulls files and
  // emails the client. The undo window. 0 disables the hold.
  issueHoldMinutes: Number(process.env.ISSUE_HOLD_MINUTES || "10"),
  resendApiKey: process.env.RESEND_API_KEY || "",
  fromEmail: process.env.FROM_EMAIL || "no-reply@cfbuildingapprovals.com.au",
  // Every link a client is emailed hangs off this. A wrong value here doesn't
  // break a build or throw anything — it just sends people somewhere that
  // isn't there, which is the worst kind of fault this system can have. So it
  // falls back to the deployment's own address rather than to localhost: an
  // unset (or aspirational) APP_URL can no longer send a client nowhere.
  appUrl:
    process.env.APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000"),

  // Landgate / SLIP cadastre, for the site plan tool's lot boundaries.
  //
  // OFF until CADASTRE_ENABLED=1. The URL below is the best-known Landgate
  // cadastre layer but has NOT been called from this codebase — see
  // docs/SPECS.md § 7. Keeping it in an environment variable means a wrong
  // guess is a Vercel setting away from being right, not a code change.
  cadastreEnabled: process.env.CADASTRE_ENABLED === "1",
  cadastreUrl: process.env.CADASTRE_URL ||
    "https://services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Property_and_Planning/MapServer/6",
  // Server-side only. SLIP's public services need nothing; an authenticated
  // one takes a token. Never NEXT_PUBLIC_, never in a response.
  cadastreToken: process.env.CADASTRE_TOKEN || "",
  // What the printed sheet names as the source of the boundary.
  cadastreSource: process.env.CADASTRE_SOURCE_NAME || "Landgate cadastre (SLIP)",
  cadastreTimeoutMs: Number(process.env.CADASTRE_TIMEOUT_MS || "6000"),
  // Development seam, demo mode only: a JSON file to answer lookups from
  // instead of calling Landgate, so the success path can be walked offline.
  cadastreFixture: process.env.CADASTRE_FIXTURE || "",
};

export const DEMO_MODE =
  !env.supabaseUrl || !env.supabaseServiceKey;

export const GRAPH_READY =
  !!(env.graphTenantId && env.graphClientId && env.graphClientSecret);

export const MONDAY_READY = !!env.mondayToken;
