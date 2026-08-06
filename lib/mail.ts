import { env } from "./env";
import { token as graphToken } from "./graph";
import { resolveAppUrl } from "./appurl";
import { rewriteLinks } from "./url.mjs";
import type { DayActivity } from "./report.mjs";

const MAIL_READY = Boolean(
  env.graphTenantId && env.graphClientId && env.graphClientSecret && env.mailFrom
);

export interface MailAttachment {
  name: string;
  contentType: string;
  bytes: Buffer;
}

/**
 * How much raw attachment one email may carry.
 *
 * Graph's `sendMail` action caps the WHOLE request at 4 MB, and base64 inflates
 * bytes by a third — so 3 MB of PDF is already 4 MB on the wire before the body
 * and envelope. Anything bigger needs a draft plus an upload session, which is
 * a lot of moving parts for a notification that already links to the file.
 * Over the budget we send the names instead; nothing is ever dropped silently.
 */
const ATTACH_BUDGET = Math.round(Number(env.mailAttachMaxMb || 2.5) * 1024 * 1024);

/** Which of these fit in one email. Returns what to attach and what didn't fit,
 *  so the body can say so rather than quietly listing files that aren't there. */
export function fitAttachments(files: MailAttachment[]): {
  attach: MailAttachment[]; tooBig: string[];
} {
  const attach: MailAttachment[] = [];
  const tooBig: string[] = [];
  let used = 0;
  for (const f of files) {
    if (used + f.bytes.length <= ATTACH_BUDGET) {
      attach.push(f);
      used += f.bytes.length;
    } else {
      tooBig.push(f.name);
    }
  }
  return { attach, tooBig };
}

/** Send as the CFBA mailbox via Microsoft Graph. Requires the app registration
 *  to hold the Mail.Send application permission and MAIL_FROM to be a real
 *  mailbox in the tenant (admin@cfba.com.au). */
export async function sendMail(
  to: string[], subject: string, html: string, attachments: MailAttachment[] = []
): Promise<boolean> {
  const recipients = to.filter(Boolean);
  if (!MAIL_READY || recipients.length === 0) return false;

  // Last stop before the wire, and the only one every email passes through.
  // The templates embed env.appUrl; if the portal's real address has been set
  // from /admin since this deployment was built, every link is repointed here
  // rather than in a dozen templates, one of which would eventually be missed.
  // See lib/appurl — this exists because a client was sent a dead button.
  const live = await resolveAppUrl();
  const body = rewriteLinks(html, env.appUrl, live);

  const message: Record<string, unknown> = {
    subject,
    body: { contentType: "HTML", content: body },
    toRecipients: recipients.map((address) => ({ emailAddress: { address } })),
  };
  if (attachments.length) {
    message.attachments = attachments.map((a) => ({
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: a.name,
      contentType: a.contentType || "application/octet-stream",
      contentBytes: a.bytes.toString("base64"),
    }));
  }

  const token = await graphToken();
  const r = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(env.mailFrom)}/sendMail`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message, saveToSentItems: true }),
    }
  );
  if (!r.ok) throw new Error(`Graph sendMail ${r.status}: ${await r.text()}`);
  return true;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The notification a client gets when we post an update on their job. The
 *  message itself is in the body: someone reading it on a phone on site should
 *  not have to log in to find out what we've asked for. */
export function updateEmail(opts: {
  companyName: string;
  ref: string;
  address: string;
  body: string;
  needsAction: boolean;
  clientRef?: string;
}): { subject: string; html: string } {
  const { ref, address, body, needsAction, clientRef } = opts;
  const subject = needsAction
    ? `Action Required — Job ${ref}, ${address}${clientRef ? ` (Your Ref ${clientRef})` : ""}`
    : `Update on Job ${ref}, ${address}${clientRef ? ` (Your Ref ${clientRef})` : ""}`;

  const html = `
<div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1B2420;max-width:640px">
  <p style="margin:0 0 16px">Hello,</p>
  <p style="margin:0 0 16px">
    ${needsAction
      ? `We need something further before we can continue with job <strong>${esc(ref)}</strong> at ${esc(address)}.`
      : `There's an update on job <strong>${esc(ref)}</strong> at ${esc(address)}.`}
  </p>
  <div style="border-left:3px solid #1E5B3C;background:#F4F8F4;padding:14px 18px;margin:0 0 18px;white-space:pre-line">${esc(body)}</div>
  ${clientRef ? `<p style="margin:0 0 14px;color:#5B6660;font-size:13px">Your reference: <strong>${esc(clientRef)}</strong></p>` : ""}
  <p style="margin:0 0 18px">
    You can reply and attach documents in the client portal — it goes straight onto
    the job, so there's no need to email as well.
  </p>
  <p style="margin:0 0 22px">
    <a href="${env.appUrl}/messages?ref=${encodeURIComponent(ref)}"
       style="background:#1E5B3C;color:#fff;text-decoration:none;padding:11px 20px;border-radius:6px;display:inline-block;font-weight:600">
      Open this job in the portal
    </a>
  </p>
  <p style="margin:0;color:#5B6660;font-size:13px">
    CF Building Approvals · 1300 029 074 · admin@cfba.com.au
  </p>
</div>`.trim();

  return { subject, html };
}

/** Sent to the client the moment a job reaches Issued — the one email the Help
 *  page promises and the number-one "is it ready yet?" call. Deep-links to the
 *  downloads page. */
export function issuedEmail(opts: {
  ref: string; address: string; clientRef?: string;
}): { subject: string; html: string } {
  const { ref, address, clientRef } = opts;
  const subject = `Your CDC Package Is Ready — Job ${ref}, ${address}${clientRef ? ` (Your Ref ${clientRef})` : ""}`;
  const html = `
<div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1B2420;max-width:640px">
  <p style="margin:0 0 16px">Hello,</p>
  <p style="margin:0 0 16px">
    Good news — the CDC Package for job <strong>${esc(ref)}</strong> at ${esc(address)}
    has been issued and is ready to download from the portal.
  </p>
  ${clientRef ? `<p style="margin:0 0 16px;color:#5B6660;font-size:14px">Your reference: <strong>${esc(clientRef)}</strong></p>` : ""}
  <p style="margin:0 0 22px">
    <a href="${env.appUrl}/downloads"
       style="background:#1E5B3C;color:#fff;text-decoration:none;padding:11px 20px;border-radius:6px;display:inline-block;font-weight:600">
      Download your CDC Package
    </a>
  </p>
  <p style="margin:0 0 18px;color:#5B6660;font-size:14px">
    Next stop is the building permit, which your council issues — lodge the CDC Package with them along with the BA1 form. The form and every council's link are under Resources in the portal. Anything you're unsure of, just ring — happy to help.
  </p>
  <p style="margin:0;color:#5B6660;font-size:13px">
    CF Building Approvals · 1300 029 074 · admin@cfba.com.au
  </p>
</div>`.trim();
  return { subject, html };
}

/** Weekly summary of a builder's active jobs, with a "waiting on you" section
 *  that doubles as a gentle FIR chase. */
export function digestEmail(opts: {
  companyName: string;
  waiting: { ref: string; address: string; status: string }[];
  active: { ref: string; address: string; status: string }[];
}): { subject: string; html: string } {
  const { companyName, waiting, active } = opts;
  const row = (j: { ref: string; address: string; status: string }) => `
    <tr>
      <td style="padding:7px 10px;border-bottom:1px solid #E8ECE9;font-family:monospace;font-size:13px;color:#5B6660">${esc(j.ref)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #E8ECE9;font-size:14px">${esc(j.address)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #E8ECE9;font-size:13px;color:#5B6660">${esc(j.status)}</td>
    </tr>`;
  const table = (rows: string) =>
    `<table style="width:100%;border-collapse:collapse;margin:6px 0 20px">${rows}</table>`;

  const html = `
<div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1B2420;max-width:640px">
  <p style="margin:0 0 16px">Hello ${esc(companyName)},</p>
  <p style="margin:0 0 16px">Here's where your jobs with us stand this week.</p>
  ${waiting.length ? `
    <p style="margin:0 0 4px;font-weight:600;color:#8A6D1E">With you (${waiting.length})</p>
    ${table(waiting.map(row).join(""))}` : ""}
  ${active.length ? `
    <p style="margin:0 0 4px;font-weight:600">In progress (${active.length})</p>
    ${table(active.map(row).join(""))}` : ""}
  <p style="margin:0 0 18px">
    <a href="${env.appUrl}/jobs" style="background:#1E5B3C;color:#fff;text-decoration:none;padding:11px 20px;border-radius:6px;display:inline-block;font-weight:600">Open the portal</a>
  </p>
  <p style="margin:0;color:#5B6660;font-size:13px">CF Building Approvals · 1300 029 074 · admin@cfba.com.au</p>
</div>`.trim();
  return { subject: `Your CFBA Jobs This Week — ${waiting.length} with You`, html };
}

/** Internal notice to the office when a client replies in the portal. Monday
 *  never notifies the token owner of updates posted with its own token, so
 *  without this a client's FIR reply — the event that unblocks a job — can
 *  sit on the board unseen. */
export function officeReplyEmail(opts: {
  companyName: string; ref: string; address: string; body: string;
  fileNames: string[];
  /** Names that came through ON this email. The rest are named but not
   *  attached — too big for Graph's 4 MB message cap — and the body says so,
   *  because "Attachments: x.pdf" on an email with no attachment is worse than
   *  saying nothing. */
  attachedNames?: string[];
}): { subject: string; html: string } {
  const { companyName, ref, address, body, fileNames } = opts;
  const attached = new Set(opts.attachedNames || []);
  const notAttached = fileNames.filter((n) => !attached.has(n));
  const subject = `Portal Reply — ${companyName}, Job ${ref}`;
  const files = fileNames.length
    ? (attached.size
        ? `<p style="margin:0 0 6px;font-size:14px"><strong>Attached to this email:</strong> ${[...attached].map(esc).join(", ")}</p>`
        : "") +
      (notAttached.length
        ? `<p style="margin:0 0 12px;font-size:14px"><strong>Too large to attach:</strong> ${notAttached.map(esc).join(", ")} — open the thread below, or find it on the Monday card.</p>`
        : "")
    : "";
  const html = `
<div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1B2420;max-width:640px">
  <p style="margin:0 0 12px"><strong>${esc(companyName)}</strong> replied on job <strong>${esc(ref)}</strong>${address ? ` (${esc(address)})` : ""}:</p>
  <div style="border-left:3px solid #1E5B3C;background:#F4F8F4;padding:14px 18px;margin:0 0 14px;white-space:pre-line">${esc(body || "(no message — files only)")}</div>
  ${files}
  <p style="margin:0 0 18px">
    <a href="${env.appUrl}/messages?ref=${encodeURIComponent(ref)}"
       style="background:#1E5B3C;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;display:inline-block;font-weight:600">
      Open the thread
    </a>
  </p>
  <p style="margin:0;color:#5B6660;font-size:13px">It's also on the job's Monday card.</p>
</div>`.trim();
  return { subject, html };
}

/** The evening report to the office. Everything that should have reached a
 *  client today and didn't, worst first — and, on a good day, two lines
 *  saying so. A quiet day has to look quiet rather than look like the report
 *  stopped working, which is why it sends either way. */
export function dailyReportEmail(r: {
  date: string;
  allClear: boolean;
  issuedToday: number; readyToday: number; downloadedToday: number;
  stuck: ReportRow[]; untold: ReportRow[]; unopened: ReportRow[];
  boardFails: ReportRow[]; queued: ReportRow[]; amendments: ReportRow[];
  noCertificate: ReportRow[];
  stuckOlder: number; unopenedOlder: number;
  enquiriesWaiting: number;
  syncProblem: string | null;
  activity: DayActivity;
}): { subject: string; html: string } {
  const nice = new Date(`${r.date}T00:00:00`).toLocaleDateString("en-AU", {
    weekday: "long", day: "numeric", month: "long",
  });

  const needsYou =
    r.stuck.length + r.untold.length + r.unopened.length + r.boardFails.length
    + r.queued.length + r.amendments.length + r.noCertificate.length + r.enquiriesWaiting
    + r.stuckOlder + r.unopenedOlder;
  const older = (n: number) =>
    n > 0 ? ` Plus ${n} more over three weeks old, not listed here.` : "";
  // A broken sync leads, because everything else in here is only as current as
  // the last run — a tidy "2 to look at" on stale data is a worse lie than no
  // report at all.
  const subject = r.allClear
    ? `CFBA portal — all clear, ${nice}`
    : r.syncProblem
      ? `CFBA portal — THE SYNC ISN'T RUNNING, ${nice}`
      : `CFBA portal — ${needsYou} to look at, ${nice}`;

  const section = (
    title: string, why: string, rows: ReportRow[], tone: "red" | "amber", olderN = 0
  ) => {
    // Rendered when there are only older ones too — a count with no section is
    // a count nobody sees.
    if (!rows.length && !olderN) return "";
    const edge = tone === "red" ? "#B3261E" : "#C9A227";
    const wash = tone === "red" ? "#FBECEC" : "#FBF4E6";
    const items = rows.map((x) => `
      <tr>
        <td style="padding:7px 12px 7px 0;font-family:ui-monospace,Menlo,monospace;font-size:13px;white-space:nowrap;vertical-align:top">${esc(x.ref)}</td>
        <td style="padding:7px 12px 7px 0;font-size:14px;vertical-align:top">
          ${esc(x.address || "—")}${x.company ? `<br><span style="color:#5B6660;font-size:13px">${esc(x.company)}</span>` : ""}
        </td>
        <td style="padding:7px 0;font-size:13px;color:#5B6660;vertical-align:top">
          ${esc(x.detail)}${x.days > 0 ? ` · <strong>${x.days} day${x.days === 1 ? "" : "s"}</strong>` : ""}
        </td>
      </tr>`).join("");
    return `
  <div style="border-left:3px solid ${edge};background:${wash};padding:14px 18px;margin:0 0 16px">
    <p style="margin:0 0 4px;font-size:15px"><strong>${esc(title)} (${rows.length + olderN})</strong></p>
    <p style="margin:0 0 ${rows.length ? "10px" : "0"};font-size:13px;color:#5B6660">${esc(why)}</p>
    ${rows.length ? `<table style="border-collapse:collapse;width:100%">${items}</table>` : ""}
  </div>`;
  };

  const body = r.allClear
    ? `<p style="margin:0 0 14px;font-size:15px">Nothing needs you. Every job that reached Issued today is in the portal, and every client who should have been told, was.</p>`
    : [
        r.syncProblem
          ? `<div style="border-left:3px solid #B3261E;background:#FBECEC;padding:14px 18px;margin:0 0 16px">
               <p style="margin:0;font-size:15px"><strong>The sync isn't running properly.</strong></p>
               <p style="margin:6px 0 0;font-size:13px;color:#5B6660">${esc(r.syncProblem)}</p>
             </div>`
          : "",
        section("Package has no certificate in it", "The files are there and downloadable, but none of them is a CDC…pdf — so the client would get everything except the certificate. The autogen leaves the CDC as a Word file; the PDF only exists once somebody exports it.", r.noCertificate, "red"),
        section("Amendments waiting", "An amendment is handled by email and deliberately kept off the board, so nothing else can notice one going quiet. Chase whoever it was sent to, or send the revised certificate back from /admin/amendments.", r.amendments, "amber"),
        section("Lodged, but not on the board", "A job normally reaches Monday the second it's lodged. These didn't, so they're sitting in the review queue at /admin — and the client believes the job is with us. Accept them, or ring the client.", r.queued, "red"),
        section("Issued but not in the portal", "The board says these are issued. The portal has no files, so the client can't download anything. Check the job's Issued folder." + older(r.stuckOlder), r.stuck, "red", r.stuckOlder),
        section("In the portal but the client wasn't told", "The files are there and downloadable. The ready email didn't send, and it won't retry — ring or email them.", r.untold, "red"),
        section("Ready, but nobody's opened it", "Not necessarily wrong. If it keeps appearing, check we have the right email address for them." + older(r.unopenedOlder), r.unopened, "amber", r.unopenedOlder),
        section("The board wouldn't take a write", "The job is fine for the client. Monday's PORTAL column just doesn't show where it's up to — set it by hand.", r.boardFails, "amber"),
        r.enquiriesWaiting > 0
          ? `<div style="border-left:3px solid #C9A227;background:#FBF4E6;padding:14px 18px;margin:0 0 16px">
               <p style="margin:0;font-size:15px"><strong>${r.enquiriesWaiting} enquir${r.enquiriesWaiting === 1 ? "y is" : "ies are"} waiting on an answer</strong></p>
               <p style="margin:6px 0 0;font-size:13px;color:#5B6660">Questions that aren't about a job, so they're not on the board.</p>
             </div>`
          : "",
      ].join("");

  // The day's activity — the other half of the report. Everything above is an
  // exception to act on; this is a plain digest of what happened and what's in
  // flight, so the email answers "what went on today?" and not only "what's
  // wrong?". Neutral by design — green and grey, no red or amber — so the eye
  // goes to the problems first.
  const a = r.activity;
  const actRows = (rows: ReportRow[], age: boolean) => rows.map((x) => `
      <tr>
        <td style="padding:5px 12px 5px 0;font-family:ui-monospace,Menlo,monospace;font-size:12px;white-space:nowrap;vertical-align:top">${esc(x.ref)}</td>
        <td style="padding:5px 12px 5px 0;font-size:13px;vertical-align:top">
          ${esc(x.address || "—")}${x.company ? `<br><span style="color:#5B6660;font-size:12px">${esc(x.company)}</span>` : ""}
        </td>
        <td style="padding:5px 0;font-size:12px;color:#5B6660;vertical-align:top">
          ${esc(x.detail)}${age && x.days > 0 ? ` · ${x.days} day${x.days === 1 ? "" : "s"}` : ""}
        </td>
      </tr>`).join("");
  const actGroup = (title: string, rows: ReportRow[], age = false) =>
    rows.length
      ? `<p style="margin:12px 0 4px;font-size:13px;font-weight:600;color:#1E5B3C">${esc(title)} (${rows.length})</p>
         <table style="border-collapse:collapse;width:100%">${actRows(rows, age)}</table>`
      : "";
  const anyActivity =
    a.lodged.length + a.amended.length + a.issued.length +
    a.downloaded.length + a.awaiting.length + a.atFir.length > 0;
  const activitySection = `
  <div style="border:1px solid #E3E7E3;border-radius:8px;padding:6px 18px 16px;margin:18px 0 0">
    <p style="margin:12px 0 0;font-size:13px;color:#5B6660;text-transform:uppercase;letter-spacing:.06em">What happened today</p>
    ${anyActivity ? [
      actGroup("Lodged", a.lodged),
      actGroup("Amendments lodged", a.amended),
      actGroup("Issued and sent back", a.issued),
      actGroup("Downloaded", a.downloaded),
      actGroup("Ready and waiting to be downloaded", a.awaiting, true),
      actGroup("With the client for further information", a.atFir, true),
    ].join("")
    : `<p style="margin:8px 0 0;font-size:13px;color:#5B6660">Nothing lodged, issued or downloaded today, and nothing waiting on a client.</p>`}
  </div>`;

  const html = `
<div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1B2420;max-width:680px">
  <p style="margin:0 0 4px;font-size:13px;color:#5B6660;text-transform:uppercase;letter-spacing:.08em">CFBA Client Portal</p>
  <p style="margin:0 0 16px;font-size:19px;font-weight:600">${esc(nice)}</p>
  ${body}
  ${activitySection}
  <p style="margin:18px 0 0;padding-top:14px;border-top:1px solid #E3E7E3;font-size:13px;color:#5B6660">
    Today: <strong>${r.issuedToday}</strong> issued · <strong>${r.readyToday}</strong> reached the portal · <strong>${r.downloadedToday}</strong> downloaded.
  </p>
  <p style="margin:14px 0 0">
    <a href="${env.appUrl}/admin"
       style="background:#1E5B3C;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;display:inline-block;font-weight:600">
      Open Portal Admin
    </a>
  </p>
</div>`.trim();
  return { subject, html };
}

interface ReportRow {
  ref: string; address: string; company: string; detail: string; days: number;
}

/** The credentials email. Username plus the one-time setup code, and the
 *  getting-started guide attached so the first thing they read isn't a login
 *  box with no context.
 *
 *  The code is in the body on purpose: an email nobody can act on without a
 *  second email is an email that generates a phone call. It works once and
 *  expires, which is what makes that safe. */
export function loginEmail(opts: {
  companyName: string; username: string; setupCode: string;
  displayName?: string; guideAttached?: boolean;
}): { subject: string; html: string } {
  const { companyName, username, setupCode, displayName, guideAttached } = opts;
  const subject = "Your CF Building Approvals client portal login";
  const html = `
<div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1B2420;max-width:640px">
  <p style="margin:0 0 12px">Hello${displayName ? " " + esc(displayName) : ""},</p>
  <p style="margin:0 0 14px">Your login for the CF Building Approvals client portal is ready. It's where
    you lodge jobs, see where each one is up to, answer anything we ask for, and download your
    CDC Package when it's issued — no phone call, no chasing.</p>

  <div style="border:1px solid #D3D8D1;border-radius:8px;padding:16px 18px;margin:0 0 16px;background:#F5F7F3">
    <p style="margin:0 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:#5B6660">Signing in the first time</p>
    <p style="margin:0 0 6px">Username: <strong style="font-family:ui-monospace,Menlo,monospace;font-size:16px">${esc(username)}</strong></p>
    <p style="margin:0 0 10px">Setup code: <strong style="font-family:ui-monospace,Menlo,monospace;font-size:16px">${esc(setupCode)}</strong></p>
    <p style="margin:0;font-size:13px;color:#5B6660">Choose <em>First time</em> on the sign-in page, enter both, and pick your own password. The setup code works once.</p>
  </div>

  <p style="margin:0 0 18px">
    <!-- Straight to First time with the username filled in. Everything this
         email gives them only works on that tab, so landing on Sign In made
         them find it themselves — usually on a phone. The setup code is
         deliberately NOT in the link: a URL is shared, forwarded and kept in
         history in a way the body of an addressed email isn't. -->
    <a href="${env.appUrl}/?first=1&amp;u=${encodeURIComponent(username)}"
       style="background:#1E5B3C;color:#fff;text-decoration:none;padding:11px 20px;border-radius:6px;display:inline-block;font-weight:600">
      Set up my login
    </a>
  </p>

  ${guideAttached
    ? `<p style="margin:0 0 12px;font-size:14px">There's a short guide attached — signing in, lodging your first job, and what each status means.</p>`
    : ""}

  <p style="margin:0 0 4px;font-size:14px">Anything at all, ring us on 1300 029 074 — we'd rather sort it in two minutes than have you stuck.</p>
  <p style="margin:0;color:#5B6660;font-size:13px">CF Building Approvals · ${esc(companyName)}</p>
</div>`.trim();
  return { subject, html };
}

/** Internal notice to the office when a client sends a general enquiry — one
 *  that isn't about a job, so there is no Monday card to post it on and no
 *  sync that will surface it. This email IS the notification: if it doesn't
 *  send, nobody knows the enquiry exists. */
export function officeEnquiryEmail(opts: {
  companyName: string; subject: string; body: string; fileNames: string[];
  attachedNames?: string[];
}): { subject: string; html: string } {
  const { companyName, subject: topic, body, fileNames } = opts;
  const attached = new Set(opts.attachedNames || []);
  const notAttached = fileNames.filter((n) => !attached.has(n));
  const subject = `Portal Enquiry — ${companyName}: ${topic}`;
  const files = fileNames.length
    ? (attached.size
        ? `<p style="margin:0 0 6px;font-size:14px"><strong>Attached to this email:</strong> ${[...attached].map(esc).join(", ")}</p>`
        : "") +
      (notAttached.length
        ? `<p style="margin:0 0 12px;font-size:14px"><strong>Too large to attach:</strong> ${notAttached.map(esc).join(", ")} — open it in the portal.</p>`
        : "")
    : "";
  const html = `
<div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1B2420;max-width:640px">
  <p style="margin:0 0 12px"><strong>${esc(companyName)}</strong> sent an enquiry through the portal. It isn't about a job, so it isn't on the board:</p>
  <p style="margin:0 0 8px;font-size:14px;color:#5B6660">About:</p>
  <div style="border-left:3px solid #C9A227;background:#FBF4E6;padding:14px 18px;margin:0 0 14px"><strong>${esc(topic)}</strong></div>
  <div style="border-left:3px solid #1E5B3C;background:#F4F8F4;padding:14px 18px;margin:0 0 14px;white-space:pre-line">${esc(body || "(no message — files only)")}</div>
  ${files}
  <p style="margin:0 0 18px">
    <a href="${env.appUrl}/admin/enquiries"
       style="background:#1E5B3C;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;display:inline-block;font-weight:600">
      Reply in the portal
    </a>
  </p>
  <p style="margin:0;color:#5B6660;font-size:13px">Replying there puts your answer in their portal and emails them. Replying to this email reaches them too, but the portal thread won't show it.</p>
</div>`.trim();
  return { subject, html };
}

/** What a client gets when the office answers their enquiry. The answer is in
 *  the body — somebody who asked a question shouldn't have to log in to read
 *  the reply. */
export function enquiryReplyEmail(opts: {
  companyName: string; body: string;
}): { subject: string; html: string } {
  const { companyName, body } = opts;
  const subject = "CF Building Approvals — reply to your enquiry";
  const html = `
<div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1B2420;max-width:640px">
  <p style="margin:0 0 12px">Hello ${esc(companyName)},</p>
  <p style="margin:0 0 12px">We've replied to your enquiry:</p>
  <div style="border-left:3px solid #1E5B3C;background:#F4F8F4;padding:14px 18px;margin:0 0 14px;white-space:pre-line">${esc(body)}</div>
  <p style="margin:0 0 18px">
    <a href="${env.appUrl}/messages?ref=GENERAL"
       style="background:#1E5B3C;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;display:inline-block;font-weight:600">
      Open the conversation
    </a>
  </p>
  <p style="margin:0;color:#5B6660;font-size:13px">You can reply in the portal, or ring us on 1300 029 074.</p>
</div>`.trim();
  return { subject, html };
}

/** Internal notice to the office when a client cancels a job from the portal.
 *  The card is already at Cancelled by the time this sends — the portal won't
 *  tell a client it's done unless the board took it — so this exists to make
 *  sure a human knows to stop work, and carries the reason they gave. */
export function officeCancelEmail(opts: {
  companyName: string; ref: string; address: string; reason: string;
}): { subject: string; html: string } {
  const { companyName, ref, address, reason } = opts;
  const subject = `Portal Cancellation — ${companyName}, Job ${ref}`;
  const html = `
<div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1B2420;max-width:640px">
  <p style="margin:0 0 12px"><strong>${esc(companyName)}</strong> cancelled job <strong>${esc(ref)}</strong>${address ? ` (${esc(address)})` : ""} through the portal.</p>
  <p style="margin:0 0 8px;font-size:14px;color:#5B6660">Their reason:</p>
  <div style="border-left:3px solid #C9A227;background:#FBF4E6;padding:14px 18px;margin:0 0 14px;white-space:pre-line">${esc(reason)}</div>
  <p style="margin:0 0 14px;font-size:14px">The card is already at <strong>Cancelled</strong> and the reason is posted on it. Nothing further is needed in the portal — this is so somebody knows to stop work.</p>
  <p style="margin:0 0 18px">
    <a href="${env.appUrl}/messages?ref=${encodeURIComponent(ref)}"
       style="background:#1E5B3C;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;display:inline-block;font-weight:600">
      Open the job
    </a>
  </p>
  <p style="margin:0;color:#5B6660;font-size:13px">If this looks like a mistake, ring the client — they were told the portal can't undo it.</p>
</div>`.trim();
  return { subject, html };
}

/**
 * The amendment email — the one that actually carries the process.
 *
 * Goes to whoever certified the original, with the office copied. An amendment
 * never opens a Monday card, so this email IS the handover: it has to be
 * answerable without opening anything, which is why the reason and the
 * documents come with it rather than being linked to.
 */
export function amendmentEmail(opts: {
  companyName: string; parentRef: string; address: string;
  reason: string; notes?: string;
  fileNames: string[]; attachedNames?: string[]; tooBigNames?: string[];
  /** Why this landed with this person — routing is automatic, so it says so. */
  routedWhy: string;
  url: string;
}): { subject: string; html: string } {
  const { companyName, parentRef, address, reason, notes, fileNames, routedWhy, url } = opts;
  const attached = opts.attachedNames || [];
  const tooBig = opts.tooBigNames || [];
  const subject = `Amendment — ${companyName}, Job ${parentRef}`;

  const files = fileNames.length
    ? (attached.length
        ? `<p style="margin:0 0 6px;font-size:14px"><strong>Attached:</strong> ${attached.map(esc).join(", ")}</p>`
        : "") +
      (tooBig.length
        ? `<p style="margin:0 0 12px;font-size:14px"><strong>Too large to attach:</strong> ${tooBig.map(esc).join(", ")} — open it in the portal below.</p>`
        : "")
    : `<p style="margin:0 0 12px;font-size:14px;color:#5B6660">No documents were attached to the lodgement.</p>`;

  const html = `
<div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1B2420;max-width:640px">
  <p style="margin:0 0 12px"><strong>${esc(companyName)}</strong> has lodged an amendment to job <strong>${esc(parentRef)}</strong>${address ? ` (${esc(address)})` : ""}.</p>

  <p style="margin:0 0 8px;font-size:14px;color:#5B6660">Why they need it changed:</p>
  <div style="border-left:3px solid #C9A227;background:#FBF4E6;padding:14px 18px;margin:0 0 14px;white-space:pre-line">${esc(reason || "(no reason given)")}</div>
  ${notes && notes.trim()
    ? `<p style="margin:0 0 8px;font-size:14px;color:#5B6660">Their note:</p>
       <div style="border-left:3px solid #E3E8E4;background:#F4F8F4;padding:12px 16px;margin:0 0 14px;white-space:pre-line;font-size:14px">${esc(notes)}</div>`
    : ""}
  ${files}

  <p style="margin:14px 0 12px;font-size:14px"><strong>If it's acceptable, reply to this email and say so.</strong> The office will watermark the new documents and re-issue the certificate. There's nothing to do in the portal or on the board.</p>

  <p style="margin:0 0 18px">
    <a href="${esc(url)}"
       style="background:#1E5B3C;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;display:inline-block;font-weight:600">
      Open it in the portal
    </a>
  </p>
  <p style="margin:0;color:#5B6660;font-size:13px">${esc(routedWhy)} This amendment is not on the Monday board — the original card carries a note that it exists.</p>
</div>`.trim();
  return { subject, html };
}

/** The revised certificate going back to the client. Deliberately reads like
 *  the issued email they already know, because to them it's the same event. */
export function amendmentReadyEmail(opts: {
  companyName: string; parentRef: string; address: string;
  fileNames: string[]; url: string;
}): { subject: string; html: string } {
  const { companyName, parentRef, address, fileNames, url } = opts;
  const subject = `Amended certificate ready — Job ${parentRef}`;
  const html = `
<div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1B2420;max-width:640px">
  <p style="margin:0 0 12px">Hello${companyName ? ` ${esc(companyName)}` : ""},</p>
  <p style="margin:0 0 12px">The amended documents for job <strong>${esc(parentRef)}</strong>${address ? ` (${esc(address)})` : ""} are ready and waiting in your portal.</p>
  ${fileNames.length
    ? `<p style="margin:0 0 14px;font-size:14px"><strong>What's there:</strong> ${fileNames.map(esc).join(", ")}</p>`
    : ""}
  <p style="margin:0 0 18px">
    <a href="${esc(url)}"
       style="background:#1E5B3C;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;display:inline-block;font-weight:600">
      Download the amended documents
    </a>
  </p>
  <p style="margin:0;color:#5B6660;font-size:13px">Your original certificate is still there too — the amendment sits alongside it rather than replacing it.</p>
</div>`.trim();
  return { subject, html };
}

/**
 * The correspondence record, sent to the office when a client collects their
 * package. The point is filing, not news — so the attachment is the deliverable
 * and the body exists to say what it is, what it isn't, and where the live
 * version lives.
 *
 * The snapshot warning is the important line. A client can message after
 * downloading, and if they do, this copy is no longer the whole thread.
 */
export function recordEmail(opts: {
  companyName: string; ref: string; address: string;
  messages: number; attached: string; whole: boolean; missing: number;
}): { subject: string; html: string } {
  const { companyName, ref, address, messages, attached, whole, missing } = opts;
  const subject = `Correspondence record — ${ref}${address ? `, ${address}` : ""}`;
  const html = `
<div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1B2420;max-width:640px">
  <p style="margin:0 0 4px;font-size:13px;color:#5B6660;text-transform:uppercase;letter-spacing:.08em">For the file</p>
  <p style="margin:0 0 14px;font-size:19px;font-weight:600">${esc(ref)}${address ? ` — ${esc(address)}` : ""}</p>

  <p style="margin:0 0 14px"><strong>${esc(companyName)}</strong> has downloaded their CDC Package, so the
    correspondence on this job is attached for filing — ${messages} message${messages === 1 ? "" : "s"}
    through the portal, both directions.</p>

  <div style="border-left:3px solid #1E5B3C;background:#F1F5F1;padding:14px 18px;margin:0 0 14px">
    <p style="margin:0;font-size:14px">Attached: <strong>${esc(attached)}</strong></p>
    ${whole
      ? `<p style="margin:6px 0 0;font-size:13px;color:#5B6660">The transcript, a plain-text copy, and every document the client attached.</p>`
      : `<p style="margin:6px 0 0;font-size:13px;color:#5B6660">The full record with the client's attachments was too large to email. This is the transcript only — download the complete zip from Records.</p>`}
    ${missing > 0
      ? `<p style="margin:6px 0 0;font-size:13px;color:#8A5E10">${missing} attachment${missing === 1 ? "" : "s"} named in the transcript could not be read back from storage. The zip in Records says which.</p>`
      : ""}
  </div>

  <div style="border-left:3px solid #C9A227;background:#FBF4E6;padding:14px 18px;margin:0 0 16px">
    <p style="margin:0;font-size:14px"><strong>This is a snapshot, taken today.</strong></p>
    <p style="margin:6px 0 0;font-size:13px;color:#5B6660">If anything further is said on this job after
      today, it won't be in the copy attached here. Records always holds the current version — re-export
      it if the conversation carries on.</p>
  </div>

  <p style="margin:0 0 18px">
    <a href="${env.appUrl}/admin/records?q=${encodeURIComponent(ref)}"
       style="background:#1E5B3C;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;display:inline-block;font-weight:600">
      Open this job in Records
    </a>
  </p>
  <p style="margin:0;color:#5B6660;font-size:13px">The transcript can only carry what came through the
    portal. Anything settled by email or over the phone still has to be filed from wherever it lives.</p>
</div>`.trim();
  return { subject, html };
}
