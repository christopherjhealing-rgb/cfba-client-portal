// Address autocomplete helpers. Plain ESM on the core.mjs pattern — Node's
// test runner imports this directly and AddressField imports the same single
// source. Everything Google-flavoured but pure lives here; the component
// keeps only the wiring (script loading, dropdown, keyboard).

// ---------------------------------------------------------------------------
// Bias. Suggestions are restricted to Australia and biased to the slab of WA
// we certify in — Perth and a few hundred kilometres around it, Kalbarri down
// to Albany and inland past Kalgoorlie. A rectangle rather than a circle
// because the Places API caps circular bias at 50 km, which barely clears the
// metro area. It is a bias, not a fence: an address further out can still be
// typed in full, or picked if Google offers it.
// ---------------------------------------------------------------------------
export const WA_BOUNDS = { south: -35.5, west: 112.5, north: -27.0, east: 123.0 };

/** Request for AutocompleteSuggestion.fetchAutocompleteSuggestions — the
 *  shape the new Places API expects, with our region and bias baked in. */
export function suggestionRequest(input, sessionToken) {
  return {
    input,
    sessionToken,
    includedRegionCodes: ["au"],
    locationBias: WA_BOUNDS,
  };
}

// ---------------------------------------------------------------------------
// Suggestion text. Google ends every Australian prediction with ", Australia";
// on a form that only ever lodges Australian jobs that's noise, so the
// trailing country — and only the trailing country — comes off. Everything
// else is Google's own formatting, kept exactly as offered: correct spelling
// and suburbs are the whole point of picking a suggestion.
// ---------------------------------------------------------------------------
export function stripCountry(s) {
  return (s || "").toString().replace(/,\s*australia\s*$/i, "").trim();
}
