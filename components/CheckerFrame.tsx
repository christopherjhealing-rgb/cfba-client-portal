"use client";
import { useRef, useState } from "react";
import { Icon } from "./Icon";

/** A checker embedded in the portal, with a way out of the portal's chrome.
 *
 *  These are desktop tools with wide member-schedule tables, and the sidebar
 *  plus page padding takes roughly 300px before the checker gets a look in.
 *  Full screen hands the whole display to the iframe without loosening the
 *  sandbox — the app still runs on an opaque origin and still can't reach the
 *  portal's cookies or this page. */
export function CheckerFrame({ src, title }: { src: string; title: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);

  async function toggle() {
    const el = box.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        setFull(false);
      } else {
        await el.requestFullscreen();
        setFull(true);
      }
    } catch {
      // Fullscreen refused (iOS Safari on iPhone doesn't allow it on a div).
      // The frame is still usable at page width — open the checker in its own
      // tab instead, which is the only full-height option there.
      window.open(src, "_blank", "noopener");
    }
  }

  return (
    <div ref={box} className="relative w-full bg-white">
      <button
        onClick={toggle}
        className="absolute right-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-md border border-rule bg-white/95 px-2.5 py-1.5 text-[12.5px] text-ink/70 shadow-sm transition hover:bg-wash hover:text-ink"
      >
        <Icon name={full ? "close" : "grid"} size={13} />
        {full ? "Exit full screen" : "Full screen"}
      </button>
      <iframe
        src={src}
        title={title}
        sandbox="allow-scripts allow-forms allow-modals allow-popups allow-downloads"
        className={`w-full bg-transparent ${
          full ? "h-screen" : "h-[calc(100vh-190px)] min-h-[600px]"
        }`}
      />
    </div>
  );
}
