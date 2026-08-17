"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/team", label: "Team", icon: "👥" },
  { href: "/drills", label: "Drills", icon: "🏉" },
  { href: "/sessions", label: "Sessions", icon: "📋" },
  { href: "/match", label: "Match", icon: "⏱️" },
] as const;

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto grid w-full max-w-md grid-cols-4">
        {TABS.map((tab) => {
          const current = pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={current ? "page" : undefined}
              className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-xs font-medium ${
                current ? "text-pitch" : "text-stone-500"
              }`}
            >
              <span className="text-xl leading-none" aria-hidden>
                {tab.icon}
              </span>
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
