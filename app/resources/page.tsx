import { redirect } from "next/navigation";
import { getClientSession } from "@/lib/session";
import * as repo from "@/lib/repo";
import { unreadCount } from "@/lib/unread";
import { AppShell, PageHead } from "@/components/AppShell";
import { disabledPages, hiddenHrefs } from "@/lib/pages";
import { PageOffline } from "@/components/PageOffline";
import { BushfireCheck } from "@/components/BushfireCheck";
import { Icon } from "@/components/Icon";
import {
  PORTAL_FORMS, FORMS_OFFICIAL_SOURCE, LINK_GROUPS, COUNCILS,
} from "@/lib/resources";

export const dynamic = "force-dynamic";

export default async function Resources() {
  const session = await getClientSession();
  if (!session) redirect("/");

  const [unread, hidden, uploadedForms] = await Promise.all([
    unreadCount(session.companyId),
    disabledPages(),
    repo.listFiles("forms").catch(() => [] as { name: string }[]),
  ]);
  const uploaded = new Set(uploadedForms.map((f) => f.name));

  if (hidden.has("resources")) {
    return (
      <AppShell company={session.companyName} impersonated={session.impersonated} unread={unread} hidden={hiddenHrefs(hidden)}>
        <PageOffline section="Resources" />
      </AppShell>
    );
  }

  return (
    <AppShell company={session.companyName} impersonated={session.impersonated} unread={unread} hidden={hiddenHrefs(hidden)}>
      <PageHead hero="/heroes/retaining.jpg" title="Resources" sub="Forms, maps and the links you need to lodge with your local government." />

      <div className="mb-6"><BushfireCheck /></div>

      {/* Council forms */}
      <section className="mb-8">
        <div className="mb-2.5 flex items-center gap-3">
          <h2 className="font-display text-[12px] font-semibold uppercase tracking-[0.15em] text-ink/70">
            Council Forms
          </h2>
          <span className="h-px flex-1 bg-rule" />
        </div>
        <p className="mb-3 max-w-2xl text-[13.5px] leading-relaxed text-ink/60">
          You lodge these with your <strong>local government</strong>, together with
          the certificate CFBA issues. We don&apos;t issue these forms — they&apos;re
          the council&apos;s. Always check you have the current version.
        </p>
        <div className="card divide-y divide-rule">
          {PORTAL_FORMS.map((f) => {
            const file = `${f.key}.pdf`;
            const hosted = uploaded.has(file);
            return (
              <div key={f.key} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <span className="font-mono text-[12px] text-seal">{f.code}</span>
                  <span className="ml-2 text-[14px] font-medium">{f.title}</span>
                  <div className="mt-0.5 text-[12.5px] text-ink/55">{f.note}</div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {hosted && (
                    <a href={`/api/forms/${file}`} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-[13px] font-medium text-seal hover:underline">
                      <Icon name="download" size={13} /> Download
                    </a>
                  )}
                  <a href={FORMS_OFFICIAL_SOURCE} target="_blank" rel="noopener noreferrer"
                    className="text-[12.5px] text-ink/50 hover:underline">Official Source</a>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Link groups */}
      {LINK_GROUPS.map((g) => (
        <section key={g.group} className="mb-8">
          <div className="mb-2.5 flex items-center gap-3">
            <h2 className="font-display text-[12px] font-semibold uppercase tracking-[0.15em] text-ink/70">
              {g.group}
            </h2>
            <span className="h-px flex-1 bg-rule" />
          </div>
          <div className="card divide-y divide-rule">
            {g.items.map((it) => (
              <a key={it.url} href={it.url} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-wash">
                <div className="min-w-0">
                  <span className="text-[14px] font-medium">{it.name}</span>
                  <div className="mt-0.5 text-[12.5px] text-ink/55">{it.note}</div>
                </div>
                <span className="shrink-0 text-ink/35"><Icon name="arrowRight" size={15} /></span>
              </a>
            ))}
          </div>
        </section>
      ))}

      {/* Councils */}
      <section className="mb-4">
        <div className="mb-2.5 flex items-center gap-3">
          <h2 className="font-display text-[12px] font-semibold uppercase tracking-[0.15em] text-ink/70">
            Your Local Government
          </h2>
          <span className="h-px flex-1 bg-rule" />
        </div>
        <p className="mb-3 max-w-2xl text-[13.5px] leading-relaxed text-ink/60">
          Where you lodge the building permit once your certificate is ready. The
          councils our clients build in most are listed first.
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {COUNCILS.map((c) => (
            <a key={c.url} href={c.url} target="_blank" rel="noopener noreferrer"
              className="card flex items-center justify-between gap-2 px-3.5 py-2.5 text-[13.5px] transition hover:bg-wash">
              <span className="truncate font-medium">{c.name}</span>
              <span className="shrink-0 text-ink/35"><Icon name="arrowRight" size={14} /></span>
            </a>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
