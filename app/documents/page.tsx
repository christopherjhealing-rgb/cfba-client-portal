import { redirect } from "next/navigation";
import { getClientSession } from "@/lib/session";
import { unreadCount } from "@/lib/unread";
import { listLibrary } from "@/lib/library";
import { AppShell, PageHead } from "@/components/AppShell";
import { disabledPages, hiddenHrefs } from "@/lib/pages";
import { LibraryManager } from "@/components/LibraryManager";

export const dynamic = "force-dynamic";

/**
 * My Documents — the company's saved engineering, as its own page (owner's
 * call, Aug 2026: the library lived under My Details and nobody found it).
 * Same store and manager the details page used; that page now points here.
 * These are the documents the Lodge form offers under "From Your Documents".
 */
export default async function DocumentsPage() {
  const session = await getClientSession();
  if (!session) redirect("/");

  const [docs, unread, hidden] = await Promise.all([
    listLibrary(session.companyId),
    unreadCount(session.companyId),
    disabledPages(),
  ]);

  return (
    <AppShell company={session.companyName} impersonated={session.impersonated}
      unread={unread} hidden={hiddenHrefs(hidden)}>
      <PageHead
        title="My Documents"
        sub="Engineering you lodge often, saved once — attach it to any job with a tick instead of another upload."
      />
      <LibraryManager initial={docs} />
      <p className="mt-4 text-[13px] leading-relaxed text-ink/60">
        Saving one: on <span className="font-medium">Lodge a Job</span>, tick{" "}
        <span className="font-medium">Save this engineering to My Documents</span>{" "}
        after attaching it — or upload it here directly. Documents saved here
        appear under <span className="font-medium">From Your Documents</span> in
        the Engineering box whenever you lodge.
      </p>
    </AppShell>
  );
}
