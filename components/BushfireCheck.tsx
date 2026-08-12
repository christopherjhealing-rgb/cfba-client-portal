"use client";
import { useState } from "react";
import { Icon } from "./Icon";

/** Opens the official DFES Map of Bush Fire Prone Areas centred on the typed
 *  address. Deliberately a deep link, not an embed: the designation is a legal
 *  determination and the authoritative answer must come from the official map,
 *  not a copy inside the portal. */
export function BushfireCheck() {
  const [address, setAddress] = useState("");

  function open() {
    const q = encodeURIComponent(address.trim());
    const url = q
      ? `https://maps.slip.wa.gov.au/landgate/bushfireprone/?find=${q}`
      : "https://maps.slip.wa.gov.au/landgate/bushfireprone/";
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="card p-5">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-brass"><Icon name="alert" size={16} /></span>
        <h2 className="font-display text-[15px] font-semibold">Is the site bushfire prone?</h2>
      </div>
      <p className="mb-3 max-w-2xl text-[13.5px] leading-relaxed text-ink/65">
        If a lot is in a designated bushfire prone area, a BAL (Bushfire Attack
        Level) assessment is required for habitable buildings — and it&apos;s
        something CFBA can prepare for you. Check the official DFES map:
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          className="field flex-1 min-w-[220px]"
          placeholder="12 Example Street, Wanneroo"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && open()}
        />
        <button className="btn" onClick={open}>Check the Official Map</button>
      </div>
      <p className="mt-2 text-[12px] text-ink/60">
        Opens the Map of Bush Fire Prone Areas (DFES) — the authoritative source.
        © Government of Western Australia (DFES), via Landgate SLIP.
      </p>
    </div>
  );
}
