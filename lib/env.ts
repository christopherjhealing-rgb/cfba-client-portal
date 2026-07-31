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

  // Lodgements go straight onto the board (default). Set to 0 to restore the
  // review queue; either way the queue still catches anything that can't
  // reach Monday at lodgement time.
  autoAcceptLodgements: (process.env.AUTO_ACCEPT_LODGEMENTS ?? "1") !== "0",

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
  turnaroundDays: process.env.TURNAROUND_DAYS || "3-4",

  // Unlocks the patio checker payload (lib/checker-payload.json). Same
  // password the standalone GitHub Pages copy is encrypted under. Unset,
  // the Tools page shows a "not switched on" notice instead.
  checkerPassword: process.env.CHECKER_PASSWORD || "",
  retentionMonths: Number(process.env.RETENTION_MONTHS || "6"),
  resendApiKey: process.env.RESEND_API_KEY || "",
  fromEmail: process.env.FROM_EMAIL || "no-reply@cfbuildingapprovals.com.au",
  appUrl: process.env.APP_URL || "http://localhost:3000",
};

export const DEMO_MODE =
  !env.supabaseUrl || !env.supabaseServiceKey;

export const GRAPH_READY =
  !!(env.graphTenantId && env.graphClientId && env.graphClientSecret);

export const MONDAY_READY = !!env.mondayToken;
