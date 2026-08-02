import { env } from "./env";
import { token as graphToken } from "./graph";

const MAIL_READY = Boolean(
  env.graphTenantId && env.graphClientId && env.graphClientSecret && env.mailFrom
);

/** Send as the CFBA mailbox via Microsoft Graph. Requires the app registration
 *  to hold the Mail.Send application permission and MAIL_FROM to be a real
 *  mailbox in the tenant (admin@cfba.com.au). */
export async function sendMail(
  to: string[], subject: string, html: string
): Promise<boolean> {
  const recipients = to.filter(Boolean);
  if (!MAIL_READY || recipients.length === 0) return false;

  const token = await graphToken();
  const r = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(env.mailFrom)}/sendMail`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: "HTML", content: html },
          toRecipients: recipients.map((address) => ({ emailAddress: { address } })),
        },
        saveToSentItems: true,
      }),
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
  const subject = `Your Certificate Is Ready — Job ${ref}, ${address}${clientRef ? ` (Your Ref ${clientRef})` : ""}`;
  const html = `
<div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1B2420;max-width:640px">
  <p style="margin:0 0 16px">Hello,</p>
  <p style="margin:0 0 16px">
    Good news — your certificate for job <strong>${esc(ref)}</strong> at ${esc(address)}
    has been issued and is ready to download from the portal.
  </p>
  ${clientRef ? `<p style="margin:0 0 16px;color:#5B6660;font-size:14px">Your reference: <strong>${esc(clientRef)}</strong></p>` : ""}
  <p style="margin:0 0 22px">
    <a href="${env.appUrl}/downloads"
       style="background:#1E5B3C;color:#fff;text-decoration:none;padding:11px 20px;border-radius:6px;display:inline-block;font-weight:600">
      Download your certificate
    </a>
  </p>
  <p style="margin:0 0 18px;color:#5B6660;font-size:14px">
    Next stop is usually the building permit — the BA1 form and every council's link are under Resources in the portal. Anything you're unsure of, just ring — happy to help.
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
  companyName: string; ref: string; address: string; body: string; fileNames: string[];
}): { subject: string; html: string } {
  const { companyName, ref, address, body, fileNames } = opts;
  const subject = `Portal Reply — ${companyName}, Job ${ref}`;
  const files = fileNames.length
    ? `<p style="margin:0 0 12px;font-size:14px"><strong>Attachments:</strong> ${fileNames.map(esc).join(", ")}</p>`
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
