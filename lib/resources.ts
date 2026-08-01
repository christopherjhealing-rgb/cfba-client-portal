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

// WA local governments within ~50 km of the Perth CBD. Homepage links are
// stable; deep-link each council's building/planning page during your review.
// CFBA's nine shire clients should be listed first once you tell me who they are.
export const COUNCILS: LinkItem[] = [
  ["Wanneroo", "wanneroo"], ["Joondalup", "joondalup"], ["Stirling", "stirling"],
  ["Swan", "swan"], ["Bayswater", "bayswater"], ["Bassendean", "bassendean"],
  ["Mundaring", "mundaring"], ["Kalamunda", "kalamunda"], ["Perth", "perth"],
  ["Vincent", "vincent"], ["Cambridge", "cambridge"], ["Subiaco", "subiaco"],
  ["Nedlands", "nedlands"], ["Belmont", "belmont"], ["Victoria Park", "victoriapark"],
  ["South Perth", "southperth"], ["Canning", "canning"], ["Melville", "melville"],
  ["Fremantle", "fremantle"], ["Cockburn", "cockburn"], ["Kwinana", "kwinana"],
  ["Rockingham", "rockingham"], ["Gosnells", "gosnells"], ["Armadale", "armadale"],
  ["Serpentine-Jarrahdale", "sjshire"],
].map(([name, slug]) => ({
  name: `City of ${name}`,
  url: `https://www.${slug}.wa.gov.au`,
  note: "Council website — building & planning",
}));
