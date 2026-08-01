import { redirect } from "next/navigation";
import { getClientSession } from "@/lib/session";
import * as repo from "@/lib/repo";
import { unreadCount } from "@/lib/unread";
import { AppShell, PageHead } from "@/components/AppShell";
import { disabledPages, hiddenHrefs } from "@/lib/pages";

export const dynamic = "force-dynamic";

/** Engineering checker — dormant until staff enable it from /admin. Clients
 *  can't reach it while disabled (no nav link, and this guard redirects). */
export default async function Engineering() {
  const session = await getClientSession();
  if (!session) redirect("/");

  const eng = await repo.getSetting<{ enabled?: boolean; url?: string }>("engineering");
  if (!eng?.enabled) redirect("/dashboard");

  const [unread, hidden] = await Promise.all([
    unreadCount(session.companyId),
    disabledPages(),
  ]);

  return (
    <AppShell company={session.companyName} impersonated={session.impersonated} unread={unread} hidden={hiddenHrefs(hidden)}>
      <PageHead title="Engineering checker" sub="Check a design against our engineering span tables before lodging." />
      <div className="card p-6">
        <p className="max-w-2xl text-[14px] leading-relaxed text-ink/70">
          This is a guide to help you check a design before lodging — it is not a
          certification and does not replace CFBA&apos;s assessment. Always confirm
          the wind region and site classification for your site.
        </p>
        {eng.url ? (
          <a href={eng.url} target="_blank" rel="noopener noreferrer" className="btn mt-4">
            Open the checker
          </a>
        ) : (
          <p className="mt-4 text-[13px] text-ink/50">The checker link hasn&apos;t been set yet.</p>
        )}
      </div>
    </AppShell>
  );
}
