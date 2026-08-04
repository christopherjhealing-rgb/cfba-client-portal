"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon, type IconName } from "./Icon";
import { Notifications } from "./Notifications";

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  badge?: number;
  /** Other routes this row owns — it stays lit while you're on one of them. */
  also?: string[];
}

// ---------------------------------------------------------------------------
// The narrow-rail preference. A display choice, not data — it lives in this
// browser's localStorage and never goes near the server.
//
// The switch itself is an attribute on <html>, and everything the rail looks
// like is CSS hanging off that attribute (RAIL below). Two reasons: BOOT runs
// before the sidebar is parsed, so a client who chose the rail never sees the
// full menu flash open first; and the attribute lives on the document rather
// than in React state, so it survives every page change for free.
// ---------------------------------------------------------------------------
const NAV_KEY = "cfba-nav";
const BOOT =
  `try{if(localStorage.getItem('${NAV_KEY}')==='collapsed')` +
  `document.documentElement.dataset.nav='collapsed'}catch(e){}`;

// Only ever from lg up. Below that the sidebar is a drawer and none of this
// applies — the toggle isn't even rendered there.
const RAIL = `
@media (min-width: 1024px) {
  .shell-aside { transition: width 0.2s ease; }
  html[data-nav="collapsed"] .shell-aside { width: 72px; overflow-x: hidden; }
  html[data-nav="collapsed"] .shell-head { padding-left: 0; padding-right: 0; }
  html[data-nav="collapsed"] .shell-logo { height: 38px; width: 38px; }
  html[data-nav="collapsed"] .shell-hide { display: none; }
  html[data-nav="collapsed"] .shell-row {
    justify-content: center; padding-left: 0; padding-right: 0;
  }
  /* The label leaves the page but not the accessible name — the icons stay
     announced, and a plain hover tooltip names them for everyone else. */
  html[data-nav="collapsed"] .shell-label {
    position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
    overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border-width: 0;
  }
  /* Unread messages must still count on the rail — the badge lifts onto the
     corner of the icon rather than being clipped off the end of the row. */
  html[data-nav="collapsed"] .shell-badge {
    position: absolute; top: 4px; right: 9px; height: 17px; min-width: 17px;
    padding-left: 3px; padding-right: 3px; font-size: 10px;
  }
  html[data-nav="collapsed"] .shell-toggle-icon { transform: rotate(180deg); }
  /* The reclaimed width goes to the page. Tool pages (wide) carry no cap at
     all and are untouched by this; the reading pages simply breathe wider. */
  html[data-nav="collapsed"] .shell-main { max-width: 1240px; }
}`;

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "grid" },
  { href: "/jobs", label: "My Jobs", icon: "list" },
  { href: "/messages", label: "My Messages", icon: "mail" },
  { href: "/submit", label: "Lodge a Job", icon: "plus" },
  { href: "/amend", label: "Amend a Job", icon: "edit" },
  { href: "/downloads", label: "Downloads", icon: "download" },
  { href: "/info-sheets", label: "Info Sheets", icon: "book" },
  // One entry, not three. The site plan tool and the engineering checker are
  // still their own screens — they're reached from Tools, and `also` keeps
  // this row lit while you're on them so the menu doesn't go blank.
  { href: "/tools", label: "Tools", icon: "tools", also: ["/site-plan", "/engineering"] },
  { href: "/resources", label: "Resources", icon: "folder" },
  { href: "/details", label: "My Details", icon: "user" },
  { href: "/help", label: "Help & Support", icon: "help" },
];

export function AppShell({
  company,
  impersonated,
  unread = 0,
  hidden = [],
  wide = false,
  children,
}: {
  company: string;
  impersonated?: boolean;
  unread?: number;
  /** hrefs switched off from /admin — filtered out of the sidebar */
  hidden?: string[];
  /** Drop the reading-width cap. For pages that are a tool rather than a
      document — the engineering checkers need every pixel they can get. */
  wide?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  // The badge starts at whatever the page rendered and is kept live by the
  // poller. Every page change hands down a fresh count, which wins — the
  // server is always the better answer when we have one.
  const [live, setLive] = useState(unread);
  useEffect(() => setLive(unread), [unread]);
  const pathname = usePathname();

  // BOOT has already set the attribute; this only brings React's idea of the
  // state into line with it, for the toggle's label and aria-expanded.
  useEffect(() => {
    setCollapsed(document.documentElement.dataset.nav === "collapsed");
  }, []);

  function toggleRail() {
    const next = !collapsed;
    setCollapsed(next);
    if (next) document.documentElement.dataset.nav = "collapsed";
    else delete document.documentElement.dataset.nav;
    try {
      localStorage.setItem(NAV_KEY, next ? "collapsed" : "expanded");
    } catch {
      /* private mode or a full disk — the menu still collapses for this visit */
    }
  }

  const nav = NAV.filter((n) => !hidden.includes(n.href)).map((n) =>
    n.href === "/messages" && live > 0 ? { ...n, badge: live } : n
  );

  return (
    <div className="min-h-screen lg:flex">
      <script dangerouslySetInnerHTML={{ __html: BOOT }} />
      <style>{RAIL}</style>

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
        className={`shell-aside fixed inset-y-0 left-0 z-50 flex w-[248px] shrink-0 flex-col bg-seal-deep transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* The mark stacks above the name at every size now. At half again the
            size it can't sit beside the name on a phone — the drawer is 248px
            wide, which left the company about 90px to live in. Stacked, both
            get the full width, and the close button lifts out of the flow into
            the corner so it costs the name nothing. */}
        <div className="shell-head relative flex flex-col items-start px-5 pb-4 pt-5 lg:items-center lg:pb-6 lg:pt-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-white.png"
            alt="CF Building Approvals"
            className="shell-logo h-[72px] w-[72px] object-contain lg:h-24 lg:w-24"
          />
          <div className="shell-hide mt-2.5 w-full lg:mt-3 lg:text-center">
            <div className="font-display text-[13px] font-bold leading-tight tracking-[0.06em] text-white">
              CF BUILDING
              <br /> APPROVALS
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
            className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-md text-white/70 transition hover:bg-white/10 lg:hidden"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <nav id="shell-nav" className="flex-1 overflow-y-auto px-3 pb-4">
          {nav.map((n) => {
            const owns = (h: string) =>
              pathname === h || pathname.startsWith(h + "/");
            const active = owns(n.href) || (n.also ?? []).some(owns);
            return (
              <Link
                key={n.href}
                href={n.href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                title={collapsed ? n.label : undefined}
                className={`shell-row relative mb-0.5 flex items-center gap-3 rounded-md px-3 py-2.5 text-[14px] transition ${
                  active
                    ? "bg-white/[0.14] font-semibold text-white"
                    : "text-white/70 hover:bg-white/[0.07] hover:text-white"
                }`}
              >
                <span className="shrink-0 opacity-80">
                  <Icon name={n.icon} size={16} />
                </span>
                <span className="shell-label flex-1">{n.label}</span>
                {n.badge ? (
                  <span className="shell-badge grid h-5 min-w-[20px] place-items-center rounded-full bg-brass px-1.5 font-mono text-[11px] font-semibold text-white">
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
            <button
              title={collapsed ? (impersonated ? "Stop Viewing" : "Sign Out") : undefined}
              className="shell-row flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-[14px] text-white/70 transition hover:bg-white/[0.07] hover:text-white"
            >
              <span className="shrink-0 opacity-80">
                <Icon name="signOut" size={16} />
              </span>
              <span className="shell-label">
                {impersonated ? "Stop Viewing" : "Sign Out"}
              </span>
            </button>
          </form>

          {/* Global search — a plain GET to My jobs, which matches ref, your
              ref, address and description. Works without JS, and rides along
              in the phone drawer. */}
          <form action="/jobs" method="get" className="shell-hide mt-3 border-t border-white/10 px-1 pt-4">
            <label htmlFor="shell-search" className="sr-only">Search your jobs</label>
            <input
              id="shell-search"
              name="q"
              type="search"
              placeholder="Search your jobs…"
              className="w-full rounded-md border border-white/10 bg-white/[0.07] px-3 py-2 text-[13px] text-white/70 outline-none transition placeholder:text-white/40 focus:border-white/30 focus:text-white"
            />
          </form>
        </nav>

        {/* Collapse control. Never below lg: there the sidebar is a drawer
            that's already out of the way, and a rail toggle would only be one
            more thing to get wrong on a phone. Default is expanded — the menu
            standing there in full is what keeps less confident clients
            oriented, so the space it costs is worth paying by default. */}
        <div className="hidden shrink-0 border-t border-white/10 px-3 py-3 lg:block">
          <button
            type="button"
            onClick={toggleRail}
            aria-expanded={!collapsed}
            aria-controls="shell-nav"
            title={collapsed ? "Expand Menu" : "Collapse Menu"}
            className="shell-row relative flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-[13px] text-white/55 transition hover:bg-white/[0.07] hover:text-white"
          >
            <span className="shell-toggle-icon shrink-0 opacity-80">
              <Icon name="chevronsLeft" size={16} />
            </span>
            <span className="shell-label flex-1">
              {collapsed ? "Expand Menu" : "Collapse Menu"}
            </span>
          </button>
        </div>

        <div className="shell-hide px-5 pb-5 text-[11px] leading-relaxed text-white/30">
          CF Building Approvals · Perth WA
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {impersonated && (
          <div className="bg-brass px-5 py-1.5 text-center font-display text-[11px] font-semibold uppercase tracking-[0.1em] text-white">
            Staff view — you are seeing this portal exactly as {company} sees it
          </div>
        )}
        <main className={`mx-auto px-5 py-7 lg:px-9 lg:py-9 ${wide ? "max-w-none" : "shell-main max-w-[1100px]"}`}>
          {children}
        </main>
      </div>

      {/* Not while a staff member is looking over the client's shoulder: the
          news isn't theirs, and the record of what's been seen belongs in the
          client's own browser, not in ours. */}
      {!impersonated && <Notifications company={company} onUnread={setLive} />}
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
    // Phones get a shorter band and a 900px image crop; the scrim and the
    // text layout are identical at every size.
    const heroM = hero.replace(/\.jpg$/, "-m.jpg");
    return (
      <div className="relative -mx-5 -mt-7 mb-7 overflow-hidden px-5 pb-5 pt-7 md:pb-7 md:pt-10 lg:-mx-9 lg:-mt-9 lg:px-9 lg:pt-12">
        <div aria-hidden="true" className="hero-photo absolute inset-0 -z-20 saturate-[0.75]"
          style={{ "--hero": `url(${hero})`, "--hero-m": `url(${heroM})` } as React.CSSProperties} />
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
  // White is right over the photo band above; here there is no band, so the
  // heading was pure white on pale paper — about 1.1:1, effectively invisible.
  // Every page without a hero was showing its title to nobody.
  return (
    <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="font-display text-[28px] font-semibold leading-tight text-ink">
          {title}
        </h1>
        {sub && <p className="mt-1 text-[14px] text-ink/60">{sub}</p>}
      </div>
      {action}
    </div>
  );
}
