# CFBA collateral suite

Print and email collateral for the client portal launch. Every document shares
`style.css` (seal green / brass / Georgia serif — matched to the portal brand)
and is laid out as an A4 page; the rendered PDFs live in `pdf/`.

## The documents

**Client-facing**

| # | Document | Use |
|---|----------|-----|
| 01 | Client portal flyer | One-page hand-out / counter flyer with QR code |
| 02 | Client portal guide (2pp) | The full how-to: first sign-in, lodging, statuses, FAQ |
| 03 | Welcome letter | Print/PDF per client — blank fields for username + setup code |
| 04 | Responding to a request | What an "Awaiting info" email means and what to do |
| 05 | Lodging card | Per-job-type checklists to get a lodgement right first time |
| 06 | Launch email (.html + .txt) | Announcement email — replace [USERNAME] / [SETUP CODE] |
| 07 | Services one-pager | Cross-sell: CDC, amendments, BAL, energy, engineering |
| 08 | Certificate — next steps | Goes out with an issued certificate: lodging BA1 to council |

**Internal**

| # | Document | Use |
|---|----------|-----|
| 09 | Job flow (2pp) | How a job moves end-to-end, who does what, what stalls one |
| 10 | Admin guide (2pp) | Running /admin: clients, logins, toggles, sheets, switches |
| 11 | Incident card | One page by the desk: symptom → fix, rollback, never-do list |

**Drafts — NOT for release until Chris signs off**

| # | Document | Status |
|---|----------|--------|
| 12 | Privacy notice | Wording review, then link from the portal sign-in page |
| 13 | Planning & Class 10 | Verify + fill [bracketed] exemption limits |
| 14 | Pool & spa barriers | Verify every figure against current AS 1926.1 / WA regs |
| 15 | Boundary structures | Verify clause refs + [R-Codes limits] |
| 16 | Wind & site classification | Verify wording |

Each draft carries a "DRAFT — NOT PUBLISHED" banner on the page; delete that
block (and this table row's warning) only after verification.

## Re-rendering

```
npm install playwright-core
node render-pdfs.mjs        # writes ./pdf/*.pdf  (see script header for Windows)
```

## When portal.cfba.com.au goes live

Links and the QR code currently point at the temporary Vercel address.
1. Find/replace `cfba-client-portal-theta.vercel.app` → `portal.cfba.com.au`
   across the .html/.txt files.
2. Regenerate the QR: `npx qrcode -t svg -o qr-portal.svg "https://portal.cfba.com.au"`
3. Re-run `node render-pdfs.mjs`.
