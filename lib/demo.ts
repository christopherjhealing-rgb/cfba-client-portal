// Demo store: a JSON file under the OS temp dir so the whole portal — sign-in,
// job lists, downloads, submissions, staff review — works with `npm run dev`
// and no external services. Seeded from the real client folders seen in
// SharePoint, plus a CFBA test client for dry runs.
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { hashPassword, hashSetupCode } from "./auth";

const FILE = path.join(os.tmpdir(), "cfba-portal-demo.json");

// Bump this whenever seed() changes shape or content. A store written by an
// older build is thrown away and reseeded rather than being loaded with fields
// missing — which is what made a new Messages seed look like "no messages".
const SEED_VERSION = 5;

export interface DemoLogin {
  username: string;
  companyId: string;
  displayName?: string | null;
  passwordHash: string | null;
  mustSetPassword: boolean;
  setupCodeHash: string | null;
  setupExpiresAt: string | null;
  disabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface DemoJob {
  ref: string;
  companyId: string;
  mondayItemId: string | null;
  address: string;
  description: string;
  mondayStatus: string;
  fileCount: number;
  issuedAt: string | null;
  receivedAt?: string | null;
  firstDownloadedAt: string | null;
  lastSyncedAt: string | null;
  storagePrefix: string;
  sourceFolder: string | null;
  firRequest?: string | null;
  clientRef?: string | null;
  surveyor?: string | null;
  files: { filename: string; size: number; storagePath: string; contentType: string }[];
}

export interface DemoSubmission {
  id: string;
  companyId: string;
  email: string;
  address: string;
  jobClass: string;
  description: string;
  notes: string;
  files: { name: string; category?: string }[];
  status: "pending" | "accepted" | "rejected";
  mondayItemId: string | null;
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
  amendmentOf?: string | null;
}

export interface DemoMessage {
  id: string;
  ref: string;
  companyId: string;
  from: "client" | "cfba";
  body: string;
  createdAt: string;
  mondayUpdateId?: string | null;
  files?: { name: string; size: number; storagePath: string; contentType: string }[];
}

export interface DemoDB {
  seedVersion?: number;
  companies: { id: string; name: string; emails: string[]; isTest?: boolean }[];
  logins: Record<string, DemoLogin>;
  jobs: Record<string, DemoJob>;
  files: Record<string, string>;
  submissions: DemoSubmission[];
  messages?: DemoMessage[];
  reads?: Record<string, Record<string, string>>;
  attempts?: Record<string, { count: number; last: string }>;
}

function placeholder(name: string): string {
  return Buffer.from(
    `%CFBA demo file — ${name}\nThis stands in for the real ${name} pulled ` +
      `from the SharePoint Issued folder in production.\n`
  ).toString("base64");
}

function seed(): DemoDB {
  const companies = [
    { id: "co_test", name: "CFBA Test Client", emails: ["test@cfbuildingapprovals.com.au"], isTest: true },
    { id: "co_ppa", name: "Perth Patios & Home Improvements", emails: ["patios@demo.test"] },
    { id: "co_adv", name: "Advanced Patios (formerly K and M)", emails: ["advanced@demo.test"] },
    { id: "co_osp", name: "One Stop Patio Shop", emails: ["onestop@demo.test"] },
    { id: "co_eod", name: "Engineering On Demand", emails: ["eod@demo.test"] },
  ];
  const now = new Date();
  const iso = (d: number) => new Date(now.getTime() - d * 86400000).toISOString();

  const jobs: Record<string, DemoJob> = {};
  const files: Record<string, string> = {};

  const mk = (
    ref: string, companyId: string, address: string, description: string,
    status: string, issuedDaysAgo: number | null, fileset: string[],
    downloadedDaysAgo: number | null, sourceFolder: string | null = null
  ) => {
    const prefix = `issued/${ref}`;
    const jf = (fileset || []).map((fn) => {
      const sp = `${prefix}/${fn}`;
      files[sp] = placeholder(fn);
      return {
        filename: fn,
        size: 24000 + fn.length * 137,
        storagePath: sp,
        contentType: fn.toLowerCase().endsWith(".pdf")
          ? "application/pdf"
          : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      };
    });
    jobs[ref] = {
      ref, companyId, mondayItemId: `demo-${ref}`, address, description,
      mondayStatus: status, fileCount: jf.length,
      issuedAt: issuedDaysAgo == null ? null : iso(issuedDaysAgo),
      firstDownloadedAt: downloadedDaysAgo == null ? null : iso(downloadedDaysAgo),
      lastSyncedAt: iso(0), storagePrefix: prefix, sourceFolder, files: jf,
    };
  };

  // --- CFBA test client: one job in every state, for a full dry run ---------
  mk("T-1001", "co_test", "1 Test Street, Greenwood", "Steel patio — ready to download",
     "Issued", 1,
     ["CDC - 1 Test Street.pdf", "Engineering - Test Design.pdf", "Site Plan.pdf"],
     null, "CFBA Test Client/1 Test Street, Greenwood - T-1001/Issued");
  jobs["T-1001"].clientRef = "PO 7583";
  mk("T-1002", "co_test", "2 Test Street, Greenwood", "Patio — being assessed",
     "To CDC", null, [], null, null);
  jobs["T-1002"].receivedAt = iso(2);
  jobs["T-1002"].clientRef = "PO 8112";
  jobs["T-1002"].surveyor = "Rebecca";
  mk("T-1003", "co_test", "3 Test Street, Greenwood", "Carport — engineering required",
     "FIR", null, [], null, null);
  jobs["T-1003"].receivedAt = iso(5);
  jobs["T-1003"].clientRef = "PO 4471";
  jobs["T-1003"].firRequest =
    "We can't finish the assessment without the structural engineering for the " +
    "carport. Please send:\n" +
    "1. Structural engineering certification for the carport, signed and dated, " +
    "stating the wind region and terrain category.\n" +
    "2. Footing details — depth, diameter and reinforcement.\n\n" +
    "Guidance note 02 (Engineering certification) sets out everything we look for.";
  mk("T-1004", "co_test", "4 Test Street, Greenwood", "Patio — final review",
     "To Check", null, [], null, null);
  jobs["T-1004"].receivedAt = iso(1);
  jobs["T-1004"].surveyor = "Chris";
  mk("T-1005", "co_test", "5 Test Street, Greenwood", "Patio — already downloaded",
     "Issued", 20, ["CDC - 5 Test Street.pdf"], 14,
     "CFBA Test Client/5 Test Street, Greenwood - T-1005/Issued");

  // --- sample real-world-shaped clients ------------------------------------
  mk("56411", "co_ppa", "32 Elvira St, Palmyra", "Steel patio to rear of dwelling",
     "Issued", 2, ["CDC - 32 Elvira Street.pdf", "Engineering - A1 Design.pdf", "Site Plan.pdf"],
     null, "Perth Patios & Home Improvements/32 Elvira St, Palmyra - 56411/Issued");
  mk("56406", "co_ppa", "3 Gimlet Place, Thornlie", "Gable patio",
     "Issued", 1, ["CDC - 3 Gimlet Place.pdf", "Structural Certificate.pdf"],
     null, "Perth Patios & Home Improvements/3 Gimlet Place, Thornlie - 56406/Issued");
  mk("56576", "co_osp", "21 Creaton Street, East Vic Park", "Flat roof patio",
     "Issued", 3, ["CDC 56576 - 21 Creaton Street.pdf", "Engineering.pdf"],
     null, "One Stop Patio Shop/21 Creaton Street, EAST VIC PARK - 56576/Issued");
  mk("56544", "co_adv", "3 Larcom Road, Lakelands", "Patio + carport", "To Check", null, [], null);
  jobs["56544"].receivedAt = iso(3);
  mk("56512", "co_eod", "18 Corrigan Way, Greenwood", "Retaining wall", "FIR - ENG", null, [], null);
  mk("56590", "co_ppa", "8 Marri Way, Willetton", "Patio", "To Assess", null, [], null);
  jobs["56590"].receivedAt = iso(0);
  mk("56320", "co_ppa", "5 Banksia Ave, Mandurah", "Patio (issued last month)",
     "Issued", 34, ["CDC - 5 Banksia Ave.pdf"], 30,
     "Perth Patios & Home Improvements/5 Banksia Ave, Mandurah - 56320/Issued");

  // --- logins ---------------------------------------------------------------
  const mkLogin = (
    username: string, companyId: string,
    opts: { password?: string; setupCode?: string } = {}
  ): DemoLogin => ({
    username,
    companyId,
    passwordHash: opts.password ? hashPassword(opts.password) : null,
    mustSetPassword: !opts.password,
    setupCodeHash: opts.setupCode ? hashSetupCode(username, opts.setupCode) : null,
    setupExpiresAt: opts.setupCode
      ? new Date(now.getTime() + 30 * 86400000).toISOString()
      : null,
    disabled: false,
    lastLoginAt: null,
    createdAt: now.toISOString(),
  });

  const logins: Record<string, DemoLogin> = {};
  // Test client: password already set so you can sign straight in.
  logins["cfba.test"] = mkLogin("cfba.test", "co_test", { password: "TestDryRun2026" });
  // A second test login that still has to set its own password — use this to
  // rehearse exactly what a new client sees.
  logins["cfba.setup"] = mkLogin("cfba.setup", "co_test", { setupCode: "AAA-BBB-CCC" });
  // Sample clients, issued but not yet activated.
  logins["perthpatios"] = mkLogin("perthpatios", "co_ppa", { setupCode: "PPA-DEM-001" });
  logins["onestop"] = mkLogin("onestop", "co_osp", { setupCode: "OSP-DEM-002" });
  logins["advancedpatios"] = mkLogin("advancedpatios", "co_adv", { setupCode: "ADV-DEM-003" });
  logins["engineeringondemand"] = mkLogin("engineeringondemand", "co_eod", { setupCode: "EOD-DEM-004" });

  // --- messages -------------------------------------------------------------
  // The FIR job carries the request as a thread, so the demo shows the round
  // trip: our ask, and the client's reply going back onto the same card.
  const messages: DemoMessage[] = [
    {
      id: "msg_seed1", ref: "T-1003", companyId: "co_test", from: "cfba",
      createdAt: iso(3), mondayUpdateId: null,
      body:
        "We can't finish the assessment without the structural engineering for the " +
        "carport. Please send:\n" +
        "1. Structural engineering certification for the carport, signed and dated, " +
        "stating the wind region and terrain category.\n" +
        "2. Footing details — depth, diameter and reinforcement.\n\n" +
        "Guidance note 02 (Engineering certification) sets out everything we look for.",
    },
    {
      // A client reply that reached the Monday card — the update id is what
      // renders the "Delivered to your surveyor" tick in the thread.
      id: "msg_seed1r", ref: "T-1003", companyId: "co_test", from: "client",
      createdAt: iso(2), mondayUpdateId: "demo-update-4471",
      body:
        "Thanks — chasing the engineer now. The certification should be with " +
        "you by Friday; the footing details are coming with it.",
    },
    {
      id: "msg_seed2", ref: "T-1002", companyId: "co_test", from: "cfba",
      createdAt: iso(6), mondayUpdateId: null,
      body:
        "Your job is with the surveyor now. Nothing needed from you at this stage — " +
        "we'll be in touch if anything comes up.",
    },
  ];

  return { seedVersion: SEED_VERSION, companies, logins, jobs, files,
           submissions: [], messages, reads: {} };
}

let cache: DemoDB | null = null;

export async function load(): Promise<DemoDB> {
  if (cache) return cache;
  try {
    const loaded = JSON.parse(await fs.readFile(FILE, "utf8")) as DemoDB;
    if (loaded.seedVersion !== SEED_VERSION) throw new Error("stale demo seed");
    cache = loaded;
  } catch {
    cache = seed();
    await save(cache);
  }
  return cache!;
}

export async function save(db: DemoDB): Promise<void> {
  cache = db;
  await fs.writeFile(FILE, JSON.stringify(db), "utf8");
}

export async function reset(): Promise<void> {
  cache = seed();
  await save(cache);
}
