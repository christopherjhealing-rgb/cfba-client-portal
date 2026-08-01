import Link from "next/link";
import { redirect } from "next/navigation";
import { getClientSession } from "@/lib/session";
import * as repo from "@/lib/repo";
import { unreadCount } from "@/lib/unread";
import { AppShell, PageHead } from "@/components/AppShell";
import { disabledPages, hiddenHrefs } from "@/lib/pages";
import { listEngSets, canAccessSet } from "@/lib/engineering";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

/** Engineering checkers — hidden until staff enable the section. Each set is
 *  a checker app served from private storage; a client only sees the sets
 *  their company is allowed. */
export default async function Engineering() {
  const session = await getClientSession();
  if (!session) redirect("/");

  const eng = await repo.getSetting<{ enabled?: boolean; url?: string }>("engineering");
  if (!eng?.enabled) redirect("/dashboard");

  const [unread, hidden, allSets] = await Promise.all([
    unreadCount(session.companyId),
    disabledPages(),
    listEngSets(),
  ]);
  const sets = allSets.filter((s) =>
    canAccessSet(s, session.companyName, !!session.impersonated));

  return (
    <AppShell company={session.companyName} impersonated={session.impersonated} unread={unread} hidden={hiddenHrefs(hidden)}>
      <PageHead title="Engineering checker" sub="Check a design against the engineering before lodging." />
      <div className="card mb-5 p-5">
        <p className="max-w-2xl text-[14px] leading-relaxed text-ink/70">
          These checkers report whether a design is covered by the engineering,
          which members are required, and exactly where in the tables each answer
          comes from. A guide, not a certification — it does not replace
          CFBA&apos;s assessment. Not sure of your wind class? See info sheet 10,
          or ask us.
        </p>
        {eng.url && (
          <a href={eng.url} target="_blank" rel="noopener noreferrer" className="btn mt-4">
            Open the external checker
          </a>
        )}
      </div>

      {sets.length === 0 ? (
        <p className="empty">
          No checker is switched on for your account yet — if you&apos;d find one
          useful for the systems you build, ask us.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {sets.map((s) => (
            <Link key={s.key} href={`/engineering/${encodeURIComponent(s.key)}`}
              className="card px-4 py-3.5 transition hover:border-seal/40 hover:bg-wash/40">
              <div className="flex items-start gap-3.5">
                <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-seal text-white">
                  <Icon name="check" size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-[14px] font-semibold leading-snug text-ink">{s.name}</p>
                  {s.note && <p className="mt-1 text-[13px] leading-snug text-ink/55">{s.note}</p>}
                </div>
                <span className="mt-0.5 shrink-0 text-seal"><Icon name="arrowRight" size={16} /></span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}
