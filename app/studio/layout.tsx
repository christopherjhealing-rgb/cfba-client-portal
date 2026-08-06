import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Site Plan Studio — CF Building Approvals",
  description:
    "Draw a compliant site plan at a real scale — lot boundary, structures, setbacks and a print-ready A4 sheet. Free, by CF Building Approvals.",
};

/**
 * The studio's own chrome — deliberately not the portal's AppShell. This is a
 * standalone product with its own front door: no job list, no messages, just
 * the tool and the account that owns the drawings. It shares the codebase so
 * it inherits every improvement to the builder for free.
 */
export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-wash">
      <header className="border-b border-rule bg-seal-deep text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3.5">
          <Link href="/studio" className="flex items-baseline gap-2.5">
            <span className="font-display text-[17px] font-semibold tracking-tight">
              Site Plan Studio
            </span>
            <span className="hidden text-[12px] text-white/60 sm:inline">
              by CF Building Approvals
            </span>
          </Link>
          <span className="text-[12px] text-white/60">
            Free · prints a true-scale A4 sheet
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-7">{children}</main>
      <footer className="border-t border-rule px-5 py-5 text-center text-[12.5px] text-ink/50">
        CF Building Approvals · 1300 029 074 · admin@cfba.com.au · Perth, Western Australia
      </footer>
    </div>
  );
}
