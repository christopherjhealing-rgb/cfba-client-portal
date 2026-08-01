// Client resources — links, council building pages, and the council forms
// clients lodge themselves. Edit this file to update anything; the page renders
// straight from it. URLs marked "// confirm" couldn't be machine-verified when
// this was built — do the 10-minute click-through before relying on them.

export interface LinkItem { name: string; url: string; note: string }
export interface LinkGroup { group: string; items: LinkItem[] }

// Council forms clients lodge WITH THE LOCAL GOVERNMENT alongside CFBA's
// certificate. CFBA issues the CDC (BA3) — never these. Staff upload the
// current PDF from /admin; until then the official source link is shown.
export interface PortalForm { key: string; code: string; title: string; note: string }

export const PORTAL_FORMS: PortalForm[] = [
  { key: "ba1", code: "BA1", title: "Application for building permit — certified",
    note: "Lodged with a certificate of design compliance (our CDC). The usual path for Class 10 work." },
  { key: "ba2", code: "BA2", title: "Application for building permit — uncertified",
    note: "For certain Class 1a/10 work where the local government does the assessment." },
  { key: "ba5", code: "BA5", title: "Application for demolition permit",
    note: "To demolish a building or structure." },
  { key: "ba13", code: "BA13", title: "Notice of completion",
    note: "Given to the permit authority when building work is complete." },
  { key: "ba19", code: "BA19", title: "Application to amend a building permit",
    note: "When an already-approved job changes. Lodge an amendment with us too." },
  { key: "ba22", code: "BA22", title: "Application for occupancy permit",
    note: "For a new commercial building or a change of use." },
];

// The one link to keep current for all forms. Paste the exact WA Building and
// Energy "building forms" page URL here after checking it.
export const FORMS_OFFICIAL_SOURCE =
  "https://www.wa.gov.au/organisation/energy-policy-wa/building-and-energy"; // confirm

export const LINK_GROUPS: LinkGroup[] = [
  {
    group: "Maps & property",
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
    group: "The rules",
    items: [
      { name: "National Construction Code (free)",
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
      { name: "Water Corporation — build over/near assets",
        url: "https://www.watercorporation.com.au/Building-and-developing", // confirm
        note: "Consent for building over or near a sewer or drain." },
      { name: "Registered building surveyor / licence search",
        url: "https://www.wa.gov.au/organisation/energy-policy-wa/building-and-energy", // confirm
        note: "Confirm a practitioner's registration." },
    ],
  },
];

// Ordered by where CFBA jobs actually land: tallied from the site addresses
// of all 3,829 Monday board items (Aug 2026, 95% mappable to an LGA). Job
// counts in the comments. Top 20 first, the remaining metro/near-metro
// councils after — the page renders this order as-is. Homepage links are
// stable; deep-link each council's building/planning page during your review.
export const COUNCILS: LinkItem[] = ([
  ["City of Wanneroo", "wanneroo"],                    // 362
  ["City of Joondalup", "joondalup"],                  // 294
  ["City of Swan", "swan"],                            // 260
  ["City of Stirling", "stirling"],                    // 258
  ["City of Rockingham", "rockingham"],                // 233
  ["City of Melville", "melville"],                    // 182
  ["City of Cockburn", "cockburn"],                    // 161
  ["City of Kalamunda", "kalamunda"],                  // 122
  ["City of Armadale", "armadale"],                    // 122
  ["City of Gosnells", "gosnells"],                    // 118
  ["City of Canning", "canning"],                      // 99
  ["City of Bayswater", "bayswater"],                  // 97
  ["City of Mandurah", "mandurah"],                    // 95
  ["Shire of Serpentine-Jarrahdale", "sjshire"],       // 77
  ["City of Kwinana", "kwinana"],                      // 56
  ["Town of Cambridge", "cambridge"],                  // 55
  ["Town of Victoria Park", "victoriapark"],           // 55
  ["Shire of Mundaring", "mundaring"],                 // 50
  ["City of South Perth", "southperth"],               // 49
  ["City of Belmont", "belmont"],                      // 40
  // — the rest —
  ["City of Fremantle", "fremantle"],                  // 37
  ["Shire of Murray", "murray"],                       // 32
  ["Town of Bassendean", "bassendean"],                // 29
  ["City of Vincent", "vincent"],                      // 20
  ["Shire of Chittering", "chittering"],               // 19
  ["City of Nedlands", "nedlands"],                    // 18
  ["City of Subiaco", "subiaco"],                      // 15
  ["Shire of Gingin", "gingin"],                       // 12
  ["City of Perth", "perth"],
] as [string, string][]).map(([name, slug]) => ({
  name,
  url: `https://www.${slug}.wa.gov.au`,
  note: "Council website — building & planning",
}));
