"use client";
import { useState } from "react";

/** Download the CDC Package.
 *
 *  This used to be a plain link that called `window.location.reload()` on a
 *  2.2 second timer, so the job would move into Downloaded once the server had
 *  recorded it. The timer was the bug: before the server can answer it reads
 *  every file back out of storage, zips them and posts a receipt to Monday —
 *  comfortably longer than two seconds — and reloading mid-flight cancels the
 *  request. Clicking Download did nothing at all, repeatably, with no error
 *  anywhere, because nothing had failed: the browser had simply been told to
 *  go somewhere else before the answer arrived.
 *
 *  Now we wait for the bytes, save them, and only then reload. It also means a
 *  server-side failure can be shown to the client instead of vanishing. */
export function DownloadButton({
  href, label = "Download", block = false,
}: {
  href: string;
  label?: string;
  /** Fill the row below lg. Used where the button shares a line with another
   *  action and the pair would otherwise run off a phone screen. Desktop is
   *  unaffected: from lg up the button is exactly the size it always was. */
  block?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(e: React.MouseEvent<HTMLAnchorElement>) {
    // Leave modified clicks (new tab, save link as) to the browser.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(href);
      if (!r.ok) {
        setError(
          (await r.text().catch(() => "")) ||
          "That didn't work. Ring us on 1300 029 074 and we'll email your documents over."
        );
        setBusy(false);
        return;
      }
      const blob = await r.blob();
      const name = /filename="([^"]+)"/.exec(r.headers.get("content-disposition") || "")?.[1];
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name || "cdc-package.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      // Safely on their machine now — refresh so the job moves across.
      window.location.reload();
    } catch {
      setError("We couldn't reach the server just then — check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <span className={`inline-flex flex-col gap-1.5 ${
      block ? "w-full items-stretch lg:w-auto lg:items-end" : "items-end"}`}>
      <a href={href} onClick={run} className={`btn ${block ? "w-full lg:w-auto" : ""}`}
        aria-busy={busy}>
        {busy ? "Preparing…" : label}
      </a>
      {error && (
        <span className={`text-[12.5px] leading-snug text-[#9E2B25] ${
          block ? "lg:max-w-[280px] lg:text-right" : "max-w-[280px] text-right"}`}>
          {error}
        </span>
      )}
    </span>
  );
}
