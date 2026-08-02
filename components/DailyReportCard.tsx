"use client";
import { useState } from "react";

interface Line { ref: string; address: string; company: string; detail: string; days: number }
interface Report {
  date: string; allClear: boolean;
  issuedToday: number; readyToday: number; downloadedToday: number;
  stuck: Line[]; untold: Line[]; unopened: Line[]; boardFails: Line[];
  queued: Line[];
  stuckOlder: number; unopenedOlder: number;
  enquiriesWaiting: number; syncProblem: string | null;
}

/** The evening report, on demand. The whole point of that email is to be the
 *  thing that notices when nothing else does, so being able to see today's
 *  without waiting for 5pm is what makes it trustworthy. */
export function DailyReportCard({ enabled, to }: { enabled: boolean; to: string }) {
  const [report, setReport] = useState<Report | null>(null);
  const [subject, setSubject] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function preview() {
    setBusy(true); setMsg(null);
    const r = await fetch("/api/report");
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg(d.error || "Couldn't build the report."); return; }
    setReport(d.report); setSubject(d.subject || "");
  }

  async function sendNow() {
    setBusy(true); setMsg(null);
    const r = await fetch("/api/report", { method: "POST" });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg(d.error || "That didn't send."); return; }
    setMsg(d.skipped ? d.skipped : d.sent ? `Sent to ${to}.` : "Built, but the email didn't go.");
  }

  const group = (title: string, rows?: Line[], olderN = 0) =>
    (rows && rows.length > 0) || olderN > 0 ? (
      <div className="mt-3">
        <p className="font-display text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/60">
          {title} ({(rows?.length || 0) + olderN})
          {olderN > 0 && (
            <span className="ml-1 font-sans normal-case tracking-normal text-ink/45">
              — {olderN} over three weeks old, not listed
            </span>
          )}
        </p>
        <ul className="mt-1.5 space-y-1">
          {(rows || []).map((x) => (
            <li key={`${title}-${x.ref}`} className="text-[13px] text-ink/75">
              <span className="font-mono text-[12px] text-ink/55">{x.ref}</span>{" "}
              {x.address || "—"}
              <span className="text-ink/50">
                {" "}· {x.detail}{x.days > 0 ? ` · ${x.days} day${x.days === 1 ? "" : "s"}` : ""}
              </span>
            </li>
          ))}
        </ul>
      </div>
    ) : null;

  return (
    <div className="card mb-6 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-display text-[12px] font-semibold uppercase tracking-[0.15em] text-ink/70">
            Evening Report
          </p>
          <p className="mt-1 text-[13px] text-ink/60">
            {enabled
              ? <>5pm on weekdays to {to || <span className="text-flag">nobody — no OFFICE_EMAIL set</span>}. Anything that should have reached a client and didn&apos;t.</>
              : <>Off. Set <span className="font-mono text-[12px]">DAILY_REPORT_ENABLED=1</span> to switch it on.</>}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={preview} disabled={busy} className="btn-ghost">
            {busy ? "…" : "See Today's"}
          </button>
          <a href="/api/report?html=1" target="_blank" rel="noreferrer" className="btn-ghost">
            Preview the Email
          </a>
          <button onClick={sendNow} disabled={busy} className="btn-ghost">Send It Now</button>
        </div>
      </div>

      {msg && <p className="mt-3 text-[13px] text-ink/70">{msg}</p>}

      {report && (
        <div className="mt-4 border-t border-rule pt-3">
          <p className="text-[13px] font-medium text-ink">{subject}</p>
          {report.syncProblem && (
            <p className="mt-2 rounded-sm border-l-[3px] border-flag bg-[#FBECEC] px-3 py-2 text-[13px] text-ink/80">
              {report.syncProblem}
            </p>
          )}
          {report.allClear && (
            <p className="mt-2 text-[13px] text-ink/70">
              Nothing needs you.
            </p>
          )}
          {group("Lodged, not on the board", report.queued)}
          {group("Issued but not in the portal", report.stuck, report.stuckOlder)}
          {group("Client wasn't told", report.untold)}
          {group("Ready, not opened", report.unopened, report.unopenedOlder)}
          {group("Board wouldn't take the write", report.boardFails)}
          {report.enquiriesWaiting > 0 && (
            <p className="mt-3 text-[13px] text-ink/75">
              {report.enquiriesWaiting} enquir{report.enquiriesWaiting === 1 ? "y" : "ies"} waiting
              on an answer.
            </p>
          )}
          <p className="mt-3 text-[12px] text-ink/50">
            Today: {report.issuedToday} issued · {report.readyToday} reached the
            portal · {report.downloadedToday} downloaded.
          </p>
        </div>
      )}
    </div>
  );
}
