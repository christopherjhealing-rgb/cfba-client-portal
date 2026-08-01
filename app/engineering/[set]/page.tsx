import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getClientSession } from "@/lib/session";
import * as repo from "@/lib/repo";
import { unreadCount } from "@/lib/unread";
import { AppShell, PageHead } from "@/components/AppShell";
import { disabledPages, hiddenHrefs } from "@/lib/pages";
import { listEngSets, canAccessSet } from "@/lib/engineering";

export const dynamic = "force-dynamic";

/** A single checker, embedded full-height. The iframe is sandboxed WITHOUT
 *  allow-same-origin: the app runs with an opaque origin, so its scripts
 *  can't reach portal cookies or the parent page — it can only compute. */
export default async function EngineeringSet({
  params,
}: { params: Promise<{ set: string }> }) {
  const session = await getClientSession();
  if (!session) redirect("/");
  const key = decodeURIComponent((await params).set);

  const eng = await repo.getSetting<{ enabled?: boolean }>("engineering");
  if (!eng?.enabled) redirect("/dashboard");

  const set = (await listEngSets()).find((s) => s.key === key);
  if (!set || !canAccessSet(set, session.companyName, !!session.impersonated)) notFound();

  const [unread, hidden] = await Promise.all([
    unreadCount(session.companyId),
    disabledPages(),
  ]);

  return (
    <AppShell company={session.companyName} impersonated={session.impersonated} unread={unread} hidden={hiddenHrefs(hidden)}>
      <PageHead
        title={set.name}
        sub="A guide, not a certification — CFBA's assessment is what counts."
        action={<Link href="/engineering" className="btn-ghost">← All checkers</Link>}
      />
      <iframe
        src={`/api/engineering/${encodeURIComponent(set.key)}`}
        title={set.name}
        sandbox="allow-scripts allow-forms allow-modals allow-popups allow-downloads"
        className="h-[calc(100vh-190px)] min-h-[600px] w-full rounded-xl border border-rule bg-white"
      />
    </AppShell>
  );
}
