// Client resources — links, council building pages, and the council forms
// clients lodge themselves. Edit this file to update anything; the page renders
// straight from it. URLs marked "// confirm" couldn't be machine-verified when
// this was built — do the 10-minute click-through before relying on them.

export interface LinkItem {
  name: string;
  url: string;
  note: string;
  /** Second link on an entry: where the application is actually lodged. Only
      the councils carry one. */
  applyUrl?: string;
}
export interface LinkGroup { group: string; items: LinkItem[] }

// Council forms clients lodge WITH THE LOCAL GOVERNMENT alongside CFBA's
// certificate. CFBA issues the CDC (BA3) — never these. Staff upload the
// current file from /admin; until then the official source link is shown.
//
// Titles below are the official ones from the wa.gov.au publication pages
// (checked 3 Aug 2026). Worth keeping exact: a client searching a council site
// for the name we printed needs to find the same form.
export interface PortalForm { key: string; code: string; title: string; note: string }

export const PORTAL_FORMS: PortalForm[] = [
  { key: "ba1", code: "BA1", title: "Application for Building Permit — Certified",
    note: "Lodged with a certificate of design compliance (our CDC). The usual path for Class 10 work." },
  { key: "ba2", code: "BA2", title: "Application for Building Permit — Uncertified",
    note: "For certain Class 1a/10 work where the local government does the assessment." },
  { key: "ba5", code: "BA5", title: "Application for Demolition Permit",
    note: "To demolish a building or structure." },
  { key: "ba7", code: "BA7", title: "Notice of Completion",
    note: "Given to the permit authority within 7 days of the work being finished. The builder's job, not ours." },
  { key: "ba13", code: "BA13", title: "Application for Building Approval Certificate",
    note: "For work already built, or an existing building that needs certifying after the fact." },
  { key: "ba19", code: "BA19", title: "Request to Amend Building Permit or Builder's Details",
    note: "When an already-approved job changes, or the builder does. Lodge an amendment with us too." },
  { key: "ba22", code: "BA22", title: "Application to Extend Time — Building or Demolition Permit",
    note: "When a permit will run out before the work is finished. Apply before it expires." },
];

// ---------------------------------------------------------------------------
// Hosting a form
//
// Councils publish these as Word about as often as PDF, and a Word original is
// the more useful one — the client can fill it in rather than print, write and
// scan. So a form is stored under whatever format was uploaded, and everything
// that links to one asks which format that was rather than assuming.
// ---------------------------------------------------------------------------

/** In preference order: if a form somehow exists in two formats, PDF is the
 *  one every client can open. */
export const FORM_EXTS = ["pdf", "docx", "doc"] as const;
export type FormExt = (typeof FORM_EXTS)[number];

export const FORM_MIME: Record<FormExt, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
};

export const FORM_LABEL: Record<FormExt, string> = {
  pdf: "PDF", docx: "Word", doc: "Word",
};

/** The extension of an uploaded file, if it's one we host. */
export function formExtOf(name: string): FormExt | null {
  const m = /\.([a-z0-9]+)$/i.exec(String(name || ""));
  const ext = m?.[1]?.toLowerCase() as FormExt | undefined;
  return ext && (FORM_EXTS as readonly string[]).includes(ext) ? ext : null;
}

/** Every name a given form could legitimately be stored under. */
export function formFileNames(key: string): string[] {
  return FORM_EXTS.map((e) => `${key}.${e}`);
}

/** Is this a filename the forms route may serve? Checked against the registry
 *  rather than parsed, so the route can't be talked into reading elsewhere. */
export function isFormFile(file: string): boolean {
  return PORTAL_FORMS.some((f) => formFileNames(f.key).includes(file));
}

/** Which file is actually hosted for a form, given what's in storage. */
export function hostedFormFile(
  key: string, uploaded: Iterable<string>
): { file: string; ext: FormExt } | null {
  const have = new Set(uploaded);
  for (const ext of FORM_EXTS) {
    const file = `${key}.${ext}`;
    if (have.has(file)) return { file, ext };
  }
  return null;
}

// The one link to keep current for all forms. Paste the exact WA Building and
// Energy "building forms" page URL here after checking it.
export const FORMS_OFFICIAL_SOURCE =
  "https://www.wa.gov.au/organisation/energy-policy-wa/building-and-energy"; // confirm

export const LINK_GROUPS: LinkGroup[] = [
  {
    group: "Maps & Property",
    items: [
      { name: "Map of Bush Fire Prone Areas (DFES)",
        url: "https://maps.slip.wa.gov.au/landgate/bushfireprone/",
        note: "The official designation. Decides whether a BAL assessment is required." },
      { name: "Landgate Map Viewer Plus",
        url: "https://maps.landgate.wa.gov.au/maps-landgate/registered/",
        note: "Property boundaries, aerial imagery and planning layers." },
    ],
  },
  {
    group: "The Rules",
    items: [
      { name: "National Construction Code (Free)",
        url: "https://ncc.abcb.gov.au/", note: "Free to read after a quick registration." },
      { name: "Residential Design Codes (R-Codes)",
        url: "https://www.wa.gov.au/government/publications/state-planning-policy-73-residential-design-codes-volume-1", // confirm
        note: "Setbacks, boundary and siting rules for residential work." },
      { name: "Building Act 2011 & Building Regulations 2012",
        url: "https://www.legislation.wa.gov.au/", note: "The legislation behind WA building approvals." },
    ],
  },
  {
    group: "Services",
    items: [
      { name: "Before You Dig Australia",
        url: "https://www.byda.com.au/", note: "Free service locations before excavation." },
      { name: "Water Corporation — Build Over/Near Assets",
        url: "https://www.watercorporation.com.au/Building-and-developing", // confirm
        note: "Consent for building over or near a sewer or drain." },
    ],
  },
];

// Every local government CFBA jobs land in, A–Z. The trailing number on each
// row is that council's share of the volume tally — the site addresses of all
// 3,829 Monday board items (Aug 2026, 95% mappable to an LGA). The order used
// to BE that tally; it's alphabetical now so a builder can find their council,
// and the counts stay in the comments so the data isn't lost.
//
// Columns: name, domain slug (<slug>.wa.gov.au), and optionally the council's
// own "lodge a building application" page.
//
// LEAVE THE THIRD COLUMN OUT and the council falls back to a site-scoped search
// of its own domain. That link always resolves and never rots — councils
// rearrange their sites constantly, and a stale deep link is worse than no deep
// link. When you've clicked through and confirmed a real one, paste it in as
// the third element: one line per council, nothing else to change.
//   ["City of Wanneroo", "wanneroo", "https://www.wanneroo.wa.gov.au/…"],
export const COUNCILS: LinkItem[] = ([
  ["City of Armadale", "armadale"],                    // 122
  ["City of Bayswater", "bayswater"],                  // 97
  ["City of Belmont", "belmont"],                      // 40
  ["City of Canning", "canning"],                      // 99
  ["City of Cockburn", "cockburn"],                    // 161
  ["City of Fremantle", "fremantle"],                  // 37
  ["City of Gosnells", "gosnells"],                    // 118
  ["City of Joondalup", "joondalup"],                  // 294
  ["City of Kalamunda", "kalamunda"],                  // 122
  ["City of Kwinana", "kwinana"],                      // 56
  ["City of Mandurah", "mandurah"],                    // 95
  ["City of Melville", "melville"],                    // 182
  ["City of Nedlands", "nedlands"],                    // 18
  ["City of Perth", "perth"],
  ["City of Rockingham", "rockingham"],                // 233
  ["City of South Perth", "southperth"],               // 49
  ["City of Stirling", "stirling"],                    // 258
  ["City of Subiaco", "subiaco"],                      // 15
  ["City of Swan", "swan"],                            // 260
  ["City of Vincent", "vincent"],                      // 20
  ["City of Wanneroo", "wanneroo"],                    // 362
  ["Shire of Chittering", "chittering"],               // 19
  ["Shire of Gingin", "gingin"],                       // 12
  ["Shire of Mundaring", "mundaring"],                 // 50
  ["Shire of Murray", "murray"],                       // 32
  ["Shire of Serpentine-Jarrahdale", "sjshire"],       // 77
  ["Town of Bassendean", "bassendean"],                // 29
  ["Town of Cambridge", "cambridge"],                  // 55
  // Western suburbs, alongside Nedlands and Subiaco. New to the list — it had
  // no volume of its own in the Aug 2026 tally.
  ["Town of Claremont", "claremont"],
  ["Town of Victoria Park", "victoriapark"],           // 55
] as [string, string, string?][])
  // Sorted on the locality, not the designation. Sorting the full name puts
  // every City first and buries Bassendean and Victoria Park at the bottom,
  // which is not what someone scanning for their own council expects.
  .sort((a, b) => {
    const locality = (s: string) => s.replace(/^(City|Town|Shire) of /, "");
    return locality(a[0]).localeCompare(locality(b[0]), "en-AU");
  })
  .map(([name, slug, applyUrl]) => ({
    name,
    url: `https://www.${slug}.wa.gov.au`,
    note: "Council website — building & planning",
    applyUrl: applyUrl ||
      `https://www.google.com/search?q=site:${slug}.wa.gov.au+building+permit+application`,
  }));
