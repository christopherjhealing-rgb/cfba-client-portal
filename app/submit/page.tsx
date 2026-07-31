import { redirect } from "next/navigation";
import { getClientSession } from "@/lib/session";
import { unreadCount } from "@/lib/unread";
import { AppShell, PageHead } from "@/components/AppShell";
import { TurnaroundLine } from "@/components/Turnaround";
import { SubmitForm } from "@/components/SubmitForm";

export const dynamic = "force-dynamic";

export default async function SubmitPage() {
  const session = await getClientSession();
  if (!session) redirect("/");
  const unread = await unreadCount(session.companyId);

  return (
    <AppShell company={session.companyName} impersonated={session.impersonated} unread={unread}>
      <PageHead
        title="Lodge a job"
        sub="Send us the site address and your plans. The office checks it over and accepts it onto the board — it will then show in your job list."
      />
      <div className="max-w-2xl">
        <div className="mb-5"><TurnaroundLine /></div>
        <SubmitForm />
      </div>
    </AppShell>
  );
}
