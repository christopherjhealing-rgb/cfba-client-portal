import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  // `absolute` escapes any title template the root sets, and applicationName /
  // appleWebApp override the portal's "CFBA Portal" so nothing in the page's
  // metadata — including the add-to-home-screen name and social previews —
  // ties the studio back to the certifier.
  title: { absolute: "Site Plan Studio" },
  description:
    "Draw a compliant site plan at a real scale — lot boundary, structures, setbacks and a print-ready A4 sheet. Free.",
  applicationName: "Site Plan Studio",
  appleWebApp: { title: "Site Plan Studio" },
};

/**
 * The studio's own chrome — a standalone product, independent of any building
 * certifier. Its own front door, its own accounts, no portal navigation.
 * (It happens to share the portal's codebase so the builder improves in both
 * places, but nothing here names or links to CF Building Approvals.)
 *
 * Support contact is intentionally left off until there's a neutral address
 * for it — never a certifier's phone or inbox, which would tie the design
 * tool back to the certifier.
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
          </Link>
          <span className="text-[12px] text-white/60">
            Free · prints a true-scale A4 sheet
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-7">{children}</main>
      <footer className="border-t border-rule px-5 py-5 text-center text-[12.5px] text-ink/50">
        Site Plan Studio · a free tool for drawing a site plan to scale
      </footer>
    </div>
  );
}
