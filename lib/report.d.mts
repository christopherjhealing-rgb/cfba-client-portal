// Types for lib/report.mjs — the day's activity for the evening report.

export interface ActivityLine {
  ref: string;
  address: string;
  company: string;
  detail: string;
  /** Whole days since the thing started — 0 for something that happened today,
   *  the age for a standing list (waiting to download, with the client). */
  days: number;
}

export interface DayActivity {
  /** The Perth calendar date this covers (YYYY-MM-DD). */
  today: string;
  /** New jobs that reached us today. */
  lodged: ActivityLine[];
  /** Amendments lodged today. */
  amended: ActivityLine[];
  /** Issued and sent back to the client today. */
  issued: ActivityLine[];
  /** Packages the client downloaded today. */
  downloaded: ActivityLine[];
  /** Ready in the portal, not downloaded yet, not old enough to be a worry. */
  awaiting: ActivityLine[];
  /** Currently with the client for further information (a standing snapshot,
   *  not dated to today — the portal can't see when the FIR was raised). */
  atFir: ActivityLine[];
}

export function perthDay(when: string | Date, tz?: string): string;

export function dayActivity(input: {
  jobs?: readonly {
    ref: string;
    companyId: string;
    address?: string | null;
    description?: string | null;
    mondayStatus?: string;
    fileCount?: number;
    issuedAt?: string | null;
    receivedAt?: string | null;
    firstDownloadedAt?: string | null;
  }[];
  submissions?: readonly {
    companyId: string;
    address?: string | null;
    amendmentOf?: string | null;
    createdAt: string;
  }[];
  companies?: readonly { id: string; name: string }[];
  now: string | Date;
  unopenedAfterDays?: number;
  tz?: string;
}): DayActivity;
