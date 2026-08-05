// Types for lib/when.mjs — Perth-safe, Invalid-Date-safe UI formatting.

/** "3 Aug 2026", or null when the input isn't a valid date. */
export function fmtDate(iso?: string | null): string | null;

/** "3 Aug · 2:15 pm", or "" when the input isn't a valid date. */
export function fmtWhen(iso?: string | null): string;

/** "3 Aug 2026, 2:15 pm", or "" when the input isn't a valid date. */
export function fmtStamp(iso?: string | null): string;

/** "1.2 MB", or "" when the size is missing or not a finite number. */
export function fmtMB(bytes?: number | null): string;
