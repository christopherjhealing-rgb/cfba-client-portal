import Link from "next/link";

const NAV = [
  { href: "/admin", label: "Queue" },
  { href: "/admin/clients", label: "Clients" },
  { href: "/admin/enquiries", label: "Enquiries" },
];

export function StaffShell({
  title, sub, active, children,
}: {
  title: string; sub?: string; active?: string; children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-rule bg-seal-deep">
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-center gap-4 px-5 py-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-white.png" alt="" className="h-9 w-9 object-contain" />
          <div className="mr-2">
            <div className="font-display text-[12px] font-bold tracking-[0.08em] text-white">
              CF BUILDING APPROVALS
            </div>
            <div className="font-display text-[9px] uppercase tracking-[0.2em] text-brass">
              Staff
            </div>
          </div>
          <nav className="flex gap-1">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href}
                className={`rounded-md px-3 py-1.5 font-display text-[11px] font-semibold uppercase tracking-[0.08em] transition ${
                  active === n.href
                    ? "bg-white/15 text-white"
                    : "text-white/65 hover:bg-white/10 hover:text-white"}`}>
                {n.label}
              </Link>
            ))}
          </nav>
          <form action="/api/admin/login" method="post" className="ml-auto">
            <input type="hidden" name="signout" value="1" />
            <button className="rounded-md px-3 py-1.5 text-[13px] text-white/65 transition hover:bg-white/10 hover:text-white">
              Sign Out
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-[1100px] px-5 py-8">
        <div className="mb-6">
          <h1 className="font-display text-[26px] font-semibold text-ink">{title}</h1>
          {sub && <p className="mt-1 text-[14px] text-ink/60">{sub}</p>}
        </div>
        {children}
      </main>
    </div>
  );
}
