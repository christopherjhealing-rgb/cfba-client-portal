import { redirect } from "next/navigation";
import { getClientSession } from "@/lib/session";
import { env } from "@/lib/env";
import { unreadCount } from "@/lib/unread";
import { AppShell, PageHead } from "@/components/AppShell";

export const dynamic = "force-dynamic";

export default async function CheckerTool() {
  const session = await getClientSession();
  if (!session) redirect("/");
  const unread = await unreadCount(session.companyId);

  return (
    <AppShell company={session.companyName} impersonated={session.impersonated} unread={unread}>
      <PageHead
        title="Patio engineering checker"
        sub="Check a patio size against the certified span tables before you lodge."
      />

      {env.checkerPassword ? (
        <>
          <div className="card overflow-hidden">
            <iframe
              src="/api/tools/checker"
              title="Patio engineering checker"
              className="block h-[78vh] min-h-[560px] w-full"
            />
          </div>
          <p className="mt-4 max-w-3xl text-[13px] leading-relaxed text-ink/55">
            A guidance tool only — handy for sizing a job up before you draw it,
            but it doesn&apos;t replace assessment. The certificate is always
            issued on our assessment of the drawings and engineering you lodge,
            not on a result from this page.
          </p>
        </>
      ) : (
        <div className="empty">
          The checker isn&apos;t switched on in this environment. Set{" "}
          <span className="font-mono">CHECKER_PASSWORD</span> to enable it.
        </div>
      )}
    </AppShell>
  );
}
