import { NextResponse } from "next/server";
import { isStaff } from "@/lib/session";
import { env } from "@/lib/env";
import { sendMail, dailyReportEmail } from "@/lib/mail";
import { buildDailyReport } from "@/lib/watchdog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function cronAuthorised(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return (req.headers.get("authorization") || "") === `Bearer ${secret}`;
}

/**
 * The evening report — everything that should have reached a client today and
 * didn't. Runs on a cron at 5pm Perth on weekdays; staff can also open it to
 * see today's, which is how you check it works without waiting for 5pm.
 *
 *   GET  /api/report            -> the report as JSON, sends nothing
 *   POST /api/report            -> builds it and emails the office
 *
 * The cron issues GET, so GET sends when it's the cron calling and only
 * previews when it's a person. A staff member refreshing a page must never
 * put email in somebody's inbox.
 */
async function build() {
  const report = await buildDailyReport();
  return { report, mail: dailyReportEmail(report) };
}

export async function GET(req: Request) {
  const cron = cronAuthorised(req);
  if (!cron && !(await isStaff())) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }
  if (!cron) {
    // A person looking. Show them exactly what would be sent — ?html=1 renders
    // the email itself, so what's checked is what lands in the inbox.
    const { report, mail } = await build();
    if (new URL(req.url).searchParams.get("html") === "1") {
      return new Response(mail.html, {
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
      });
    }
    return NextResponse.json({ preview: true, subject: mail.subject, report });
  }
  return send();
}

export async function POST(req: Request) {
  if (!cronAuthorised(req) && !(await isStaff())) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }
  return send();
}

async function send() {
  if (!env.dailyReportEnabled) {
    return NextResponse.json({ skipped: "DAILY_REPORT_ENABLED is not set." });
  }
  if (!env.officeEmail) {
    return NextResponse.json({ skipped: "No OFFICE_EMAIL set — nowhere to send it." });
  }
  try {
    const { report, mail } = await build();
    const sent = await sendMail([env.officeEmail], mail.subject, mail.html);
    // A report that can't send is the one failure nothing else would catch —
    // it exists to be the thing that notices. Loud in the log.
    if (!sent) console.error("daily report: sendMail returned false — nobody was told.");
    return NextResponse.json({ ok: true, sent, allClear: report.allClear });
  } catch (e) {
    console.error("daily report failed:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
