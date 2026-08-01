import { redirect } from "next/navigation";
import { getClientSession } from "@/lib/session";
import { unreadCount } from "@/lib/unread";
import { AppShell, PageHead } from "@/components/AppShell";
import { disabledPages, hiddenHrefs } from "@/lib/pages";
import { PageOffline } from "@/components/PageOffline";
import { TurnaroundLine } from "@/components/Turnaround";
import { SubmitForm } from "@/components/SubmitForm";

export const dynamic = "force-dynamic";

export default async function SubmitPage() {
  const session = await getClientSession();
  if (!session) redirect("/");
  const unread = await unreadCount(session.companyId);

  const hidden = await disabledPages();

  if (hidden.has("submit")) {
    return (
      <AppShell company={session.companyName} impersonated={session.impersonated} unread={unread} hidden={hiddenHrefs(hidden)}>
        <PageOffline section="Lodging a job" />
      </AppShell>
    );
  }

  return (
    <AppShell company={session.companyName} impersonated={session.impersonated} unread={unread} hidden={hiddenHrefs(hidden)}>
      <PageHead
        hero="/heroes/deck.jpg"
        title="Lodge a job"
        sub="Send us the site address and your plans — the job lands straight on our board and appears in your job list."
      />
      <div className="max-w-2xl">
        <div className="mb-5"><TurnaroundLine /></div>
        <SubmitForm />
      </div>
    </AppShell>
  );
}
