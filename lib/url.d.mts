// Types for lib/url.mjs — the portal's own address.

/** Normalise a portal address, or return "" if it isn't a usable http(s) URL. */
export function tidyUrl(s: unknown): string;

/** Repoint every occurrence of `from` in built email HTML at `to`. */
export function rewriteLinks(html: string, from: string, to: string): string;
