"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Icon, type IconName } from "./Icon";

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  badge?: number;
}

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "grid" },
  { href: "/jobs", label: "My jobs", icon: "list" },
  { href: "/submit", label: "Lodge a job", icon: "plus" },
  { href: "/amend", label: "Amend a job", icon: "edit" },
  { href: "/downloads", label: "Downloads", icon: "download" },
  { href: "/info-sheets", label: "Info sheets", icon: "book" },
  { href: "/resources", label: "Resources", icon: "folder" },
  { href: "/site-plan", label: "Site plan tool", icon: "edit" },
  { href: "/engineering", label: "Engineering", icon: "check" },
  { href: "/messages", label: "Messages", icon: "mail" },
  { href: "/details", label: "My details", icon: "user" },
  { href: "/help", label: "Help & support", icon: "help" },
];

export function AppShell({
  company,
  impersonated,
  unread = 0,
  hidden = [],
  children,
}: {
  company: string;
  impersonated?: boolean;
  unread?: number;
  /** hrefs switched off from /admin — filtered out of the sidebar */
  hidden?: string[];
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const nav = NAV.filter((n) => !hidden.includes(n.href)).map((n) =>
    n.href === "/messages" && unread > 0 ? { ...n, badge: unread } : n
  );

  return (
    <div className="min-h-screen lg:flex">
      {/* Mobile bar — the sidebar is a drawer below lg, because clients open
          this standing on a site with a phone in one hand. */}
      <div className="flex items-center gap-3 border-b border-rule bg-seal-deep px-4 py-3 text-white lg:hidden">
        <button
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="grid h-9 w-9 place-items-center rounded-md text-white/80 transition hover:bg-white/10 hover:text-white"
        >
          <Icon name="menu" size={20} />
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-white.png" alt="" className="h-8 w-8 object-contain" />
        <span className="font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">
          Client Portal
        </span>
      </div>

      {open && (
        <button
          aria-label="Close menu"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-ink/40 lg:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[248px] shrink-0 flex-col bg-seal-deep transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-start gap-3 px-5 pb-6 pt-6 lg:flex-col lg:items-center lg:gap-0 lg:pt-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-white.png"
            alt="CF Building Approvals"
            className="h-12 w-12 object-contain lg:h-16 lg:w-16"
          />
          <div className="lg:mt-3 lg:text-center">
            <div className="font-display text-[13px] font-bold leading-tight tracking-[0.06em] text-white">
              CF BUILDING
              <br className="hidden lg:block" /> APPROVALS
            </div>
            <div className="mt-1 font-display text-[9px] uppercase tracking-[0.22em] text-white/45">
              Client Portal
            </div>
            <div className="mt-2 border-t border-white/10 pt-2 text-[12px] font-medium leading-snug text-white/75 lg:mt-2.5 lg:pt-2.5">
              {company}
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="ml-auto grid h-9 w-9 place-items-center rounded-md text-white/70 transition hover:bg-white/10 lg:hidden"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          {nav.map((n) => {
            const active =
              pathname === n.href || pathname.startsWith(n.href + "/");
            return (
              <Link
                key={n.href}
                href={n.href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={`mb-0.5 flex items-center gap-3 rounded-md px-3 py-2.5 text-[14px] transition ${
                  active
                    ? "bg-white/[0.14] font-semibold text-white"
                    : "text-white/70 hover:bg-white/[0.07] hover:text-white"
                }`}
              >
                <span className="shrink-0 opacity-80">
                  <Icon name={n.icon} size={16} />
                </span>
                <span className="flex-1">{n.label}</span>
                {n.badge ? (
                  <span className="grid h-5 min-w-[20px] place-items-center rounded-full bg-brass px-1.5 font-mono text-[11px] font-semibold text-white">
                    {n.badge}
                  </span>
                ) : null}
              </Link>
            );
          })}

          <div className="my-3 h-px bg-white/10" />

          <form
            action={impersonated ? "/api/admin/impersonate" : "/api/auth/logout"}
            method="post"
          >
            {impersonated && <input type="hidden" name="stop" value="1" />}
            <button className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-[14px] text-white/70 transition hover:bg-white/[0.07] hover:text-white">
              <span className="shrink-0 opacity-80">
                <Icon name="signOut" size={16} />
              </span>
              {impersonated ? "Stop viewing" : "Sign out"}
            </button>
          </form>
        </nav>

        <div className="px-5 pb-5 text-[11px] leading-relaxed text-white/30">
          CF Building Approvals · Perth WA
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {impersonated && (
          <div className="bg-brass px-5 py-1.5 text-center font-display text-[11px] font-semibold uppercase tracking-[0.1em] text-white">
            Staff view — you are seeing this portal exactly as {company} sees it
          </div>
        )}
        <main className="mx-auto max-w-[1100px] px-5 py-7 lg:px-9 lg:py-9">
          {children}
        </main>
      </div>
    </div>
  );
}

export function PageHead({
  title,
  sub,
  action,
  hero,
}: {
  title: string;
  sub?: string;
  action?: React.ReactNode;
  /** Path to a photo (e.g. /heroes/pool.jpg) — renders the head as a photo
      band with a deep-green scrim, matching the guidance-note covers. */
  hero?: string;
}) {
  if (hero) {
    return (
      <div className="relative -mx-5 -mt-7 mb-7 overflow-hidden px-5 pb-7 pt-10 lg:-mx-9 lg:-mt-9 lg:px-9 lg:pt-12">
        <div aria-hidden="true" className="absolute inset-0 -z-20 bg-cover bg-center saturate-[0.75]"
          style={{ backgroundImage: `url(${hero})` }} />
        <div aria-hidden="true"
          className="absolute inset-0 -z-10 bg-gradient-to-r from-[#0D211A] via-[#0D211A]/65 to-[#0D211A]/10" />
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-[28px] font-semibold leading-tight text-white">
              {title}
            </h1>
            {sub && <p className="mt-1 max-w-2xl text-[14px] text-white/75">{sub}</p>}
          </div>
          {action}
        </div>
      </div>
    );
  }
  return (
    <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="font-display text-[28px] font-semibold leading-tight text-white">
          {title}
        </h1>
        {sub && <p className="mt-1 text-[14px] text-ink/60">{sub}</p>}
      </div>
      {action}
    </div>
  );
}
