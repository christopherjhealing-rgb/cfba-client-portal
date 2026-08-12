"use client";
import { useEffect, useId, useRef, useState } from "react";
import { stripCountry, suggestionRequest, type SuggestionRequest } from "@/lib/address.mjs";
import { GOOGLE_MAPS_KEY, loadMapsLibrary } from "@/lib/google-maps";

// The site-address input with Google suggestions laid over it — the new
// Places API (AutocompleteSuggestion + session tokens), because the legacy
// Autocomplete widget is closed to Google projects created after March 2025.
// Suggestions render in our own dropdown so it looks like the portal, and
// they are pure autocomplete: no Place Details call, no per-pick billing.
//
// The typed text is always what submits — picking a suggestion just replaces
// it. With no key, a blocked script or a Google wobble the field is exactly
// the plain input it replaced: new lots that aren't on the maps yet must
// never be blocked, and a missing optional key must never show.

const KEY = GOOGLE_MAPS_KEY;
const MIN_CHARS = 3;
const DEBOUNCE_MS = 250;
const MAX_STRIKES = 3; // consecutive fetch failures before we stop asking

// ---------------------------------------------------------------------------
// The places library. The script bootstrap itself lives in lib/google-maps —
// one loader for the whole portal — and this only checks that the two members
// we actually call turned up.
// ---------------------------------------------------------------------------

// The slice of the places library we call. The full @types/google.maps is a
// heavy dependency for two members, so the shape is declared here.
interface PlacesLibrary {
  AutocompleteSessionToken: new () => object;
  AutocompleteSuggestion: {
    fetchAutocompleteSuggestions(req: SuggestionRequest): Promise<{
      suggestions?: Array<{ placePrediction?: { text?: { text?: string } | null } | null }>;
    }>;
  };
}

let placesOnce: Promise<PlacesLibrary | null> | null = null;

/** Resolves the places library, or null when there's no key or Google can't
 *  be reached — every caller treats null as "plain input today". */
function loadPlaces(): Promise<PlacesLibrary | null> {
  if (!placesOnce) placesOnce = bootPlaces();
  return placesOnce;
}

async function bootPlaces(): Promise<PlacesLibrary | null> {
  const lib = await loadMapsLibrary<Partial<PlacesLibrary>>("places");
  if (!lib?.AutocompleteSessionToken || !lib.AutocompleteSuggestion?.fetchAutocompleteSuggestions) {
    return null;
  }
  return lib as PlacesLibrary;
}

// ---------------------------------------------------------------------------
// The field.
// ---------------------------------------------------------------------------

export function AddressField({
  id, value, onChange, placeholder, required, autoFocus,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  autoFocus?: boolean;
}) {
  const listId = useId();
  const [options, setOptions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const listRef = useRef<HTMLUListElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0); // stamps each fetch; anything stale is dropped
  const token = useRef<object | null>(null); // one per focus session, fresh after a pick
  const focused = useRef(false);
  const strikes = useRef(0);

  function close() {
    setOpen(false);
    setActive(-1);
  }

  // Keyboard navigation can walk below the fold of the scrolling panel.
  useEffect(() => {
    if (active >= 0) listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    seq.current++;
  }, []);

  function ask(text: string) {
    const mine = ++seq.current;
    void (async () => {
      const lib = await loadPlaces();
      if (!lib || strikes.current >= MAX_STRIKES) return;
      try {
        token.current ??= new lib.AutocompleteSessionToken();
        const { suggestions } = await lib.AutocompleteSuggestion.fetchAutocompleteSuggestions(
          suggestionRequest(text, token.current),
        );
        if (mine !== seq.current || !focused.current) return;
        strikes.current = 0;
        const labels = (suggestions || [])
          .map((s) => stripCountry(s.placePrediction?.text?.text))
          .filter(Boolean);
        setOptions(labels);
        setActive(-1);
        setOpen(labels.length > 0);
      } catch {
        // Quota, key restrictions, network — never the client's problem.
        strikes.current += 1;
        if (mine === seq.current) close();
      }
    })();
  }

  function type(next: string) {
    onChange(next); // the typed text is the value, always
    seq.current++; // anything in flight answers the old text
    if (timer.current) clearTimeout(timer.current);
    const text = next.trim();
    if (!KEY || text.length < MIN_CHARS) {
      close();
      setOptions([]);
      return;
    }
    timer.current = setTimeout(() => ask(text), DEBOUNCE_MS);
  }

  function pick(label: string) {
    onChange(label);
    token.current = null; // a pick ends the autocomplete session
    seq.current++;
    if (timer.current) clearTimeout(timer.current);
    setOptions([]);
    close();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        close();
      }
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!options.length) return;
      e.preventDefault();
      if (!open) setOpen(true);
      setActive((a) =>
        e.key === "ArrowDown"
          ? a >= options.length - 1 ? 0 : a + 1
          : a <= 0 ? options.length - 1 : a - 1,
      );
      return;
    }
    if (e.key === "Enter" && open && active >= 0) {
      e.preventDefault(); // picks the suggestion rather than lodging the form
      pick(options[active]);
    }
  }

  return (
    <>
      <div className="relative">
        {/* text-[16px] on phones so iOS doesn't zoom the form when the field
            focuses; back to the house 15px from sm up. */}
        <input
          id={id}
          value={value}
          onChange={(e) => type(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => {
            focused.current = true;
            if (KEY) void loadPlaces(); // first focus pulls the script; later ones no-op
          }}
          onBlur={() => {
            focused.current = false;
            token.current = null; // next focus is a new session
            // Delay so a tap on a suggestion lands before the list goes.
            setTimeout(() => {
              if (!focused.current) close();
            }, 150);
          }}
          className="field text-[16px] sm:text-[15px]"
          placeholder={placeholder}
          required={required}
          autoFocus={autoFocus}
          autoComplete={KEY ? "off" : undefined}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        />
        {open && options.length > 0 && (
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label="Address suggestions"
            className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-rule bg-white shadow-lg"
          >
            {options.map((label, i) => (
              <li
                key={`${i}-${label}`}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(label)}
                onMouseEnter={() => setActive(i)}
                className={`flex min-h-[44px] cursor-pointer items-center px-3 py-2.5 text-[14px] text-ink transition ${
                  i === active ? "bg-wash" : "hover:bg-wash"
                }`}
              >
                {label}
              </li>
            ))}
            <li role="presentation" className="border-t border-rule/70 px-3 py-1.5 text-right text-[10px] text-ink/60">
              Powered by Google
            </li>
          </ul>
        )}
      </div>
      {KEY && (
        <p className="mt-1.5 text-[12px] text-ink/60">
          Start typing and pick your address — or just type it in full if it&apos;s a
          new lot that isn&apos;t on the maps yet.
        </p>
      )}
    </>
  );
}
