import { redirect } from "next/navigation";
import { getClientSession } from "@/lib/session";
import * as repo from "@/lib/repo";
import { unreadCount } from "@/lib/unread";
import { AppShell, PageHead } from "@/components/AppShell";
import { disabledPages, hiddenHrefs } from "@/lib/pages";
import { SpanChecker } from "@/components/SpanChecker";
import { SPAN_SETS } from "@/lib/engineering";

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
      <PageHead title="Engineering checker" sub="Check a design against span tables before lodging." />
      <div className="card mb-5 p-5">
        <p className="max-w-2xl text-[14px] leading-relaxed text-ink/70">
          A guide to help you check a design before lodging — it is not a
          certification and does not replace CFBA&apos;s assessment. Not sure of
          your wind class? See info sheet 10, <em>Wind class &amp; site
          classification</em>, or ask us.
        </p>
        {eng.url && (
          <a href={eng.url} target="_blank" rel="noopener noreferrer" className="btn mt-4">
            Open the full checker
          </a>
        )}
      </div>
      <SpanChecker sets={SPAN_SETS} />
    </AppShell>
  );
}
