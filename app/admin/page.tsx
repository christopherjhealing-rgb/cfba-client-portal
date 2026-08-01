import Link from "next/link";
import { redirect } from "next/navigation";
import { isStaff } from "@/lib/session";
import { DEMO_MODE, GRAPH_READY, MONDAY_READY, env } from "@/lib/env";
import * as repo from "@/lib/repo";
import { StaffShell } from "@/components/StaffShell";
import { SyncButton } from "@/components/SyncButton";
import { DecisionButtons } from "@/components/DecisionButtons";
import { PageToggles } from "@/components/PageToggles";
import { TOGGLEABLE_PAGES } from "@/lib/pages";
import { InfoSheetManager } from "@/components/InfoSheetManager";
import { PUBLISHED_SHEETS } from "@/lib/info-sheets";
import { SyncHealth } from "@/components/SyncHealth";
import { FormManager } from "@/components/FormManager";
import { PORTAL_FORMS } from "@/lib/resources";
import { EngineeringControl } from "@/components/EngineeringControl";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  if (!(await isStaff())) redirect("/admin/login");

  const [pending, companies, disabled, sheetOverrides, lastSync] = await Promise.all([
    repo.listSubmissions("pending"),
    repo.listCompanies(),
    repo.disabledPages(),
    repo.listFiles("info-sheets").catch(() => []),
    repo.getSetting<Record<string, unknown>>("last_sync").catch(() => null),
  ]);
  const uploadedForms = await repo.listFiles("forms").catch(() => []);
  const eng = (await repo.getSetting<{ enabled?: boolean; url?: string }>("engineering").catch(() => null)) || {};
  const names: Record<string, string> = {};
  for (const c of companies) names[c.id] = c.name;

  return (
    <StaffShell title="Submission queue" sub="Jobs lodged through the portal, waiting to be accepted onto the board." active="/admin">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">CFBA office</p>
            <h1 className="mt-1 font-display text-[26px] font-semibold">Portal admin</h1>
          </div>
          <div className="flex gap-2">
            <Link href="/admin/clients" className="btn-ghost">Clients &amp; logins</Link>
            <SyncButton />
          </div>
        </div>

        <div className="card mb-8 divide-y divide-rule text-[13px]">
          <Row label="Data store" value={DEMO_MODE ? "Demo (no Supabase configured)" : "Supabase"} warn={DEMO_MODE} />
          <Row label="Monday board" value={MONDAY_READY ? `Connected · ${env.mondayBoardId}` : "No MONDAY_TOKEN set"} warn={!MONDAY_READY} />
          <Row label="SharePoint (Graph)" value={GRAPH_READY ? "Connected" : "No Graph credentials set"} warn={!GRAPH_READY} />
          <Row label="Retention" value={`${env.retentionMonths} months from first download`} />
        </div>

        <SyncHealth
          last={lastSync as never}
          companies={companies.map((c) => ({ id: c.id, name: c.name }))}
        />

        <PageToggles
          pages={TOGGLEABLE_PAGES.map((p) => ({ key: p.key, label: p.label }))}
          initialDisabled={[...disabled]}
        />

        <InfoSheetManager
          sheets={PUBLISHED_SHEETS.map((s) => ({ file: s.file, title: s.title }))}
          overridden={sheetOverrides.map((f) => f.name)}
        />

        <FormManager
          forms={PORTAL_FORMS.map((f) => ({ key: f.key, code: f.code, title: f.title }))}
          uploaded={uploadedForms.map((f) => f.name)}
        />

        <EngineeringControl initial={{ enabled: !!eng.enabled, url: eng.url || "" }} />

        <section>
          <div className="mb-2.5 flex items-center gap-3">
            <h2 className="font-display text-[12px] font-semibold uppercase tracking-[0.15em] text-ink/70">
              Submissions awaiting review
            </h2>
            <span className="h-px flex-1 bg-rule" />
            <span className="font-mono text-[12px] text-ink/45">{pending.length}</span>
          </div>

          {pending.length === 0 ? (
            <p className="rounded-md border border-dashed border-rule bg-wash px-4 py-8 text-center text-[13px] text-ink/50">
              Nothing waiting. Jobs lodged through the portal land here for checking
              before they go on the board.
            </p>
          ) : (
            <div className="space-y-3">
              {pending.map((s) => (
                <div key={s.id} className="card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{s.address}</span>
                        {s.jobClass && <span className="chip">{s.jobClass}</span>}
                      </div>
                      <div className="mt-0.5 text-[13px] text-ink/60">{s.description}</div>
                      {s.notes && (
                        <div className="mt-2 rounded-sm border-l-[3px] border-seal-2 bg-wash px-3 py-1.5 text-[13px] text-ink/70">
                          <span className="font-display text-[10px] font-semibold uppercase tracking-[0.1em] text-ink/45">Note</span>
                          <div className="mt-0.5 whitespace-pre-wrap">{s.notes}</div>
                        </div>
                      )}
                      <div className="mt-1.5 text-[12px] text-ink/50">
                        {names[s.companyId] || s.companyId}
                        {s.email && <> · {s.email}</>}
                        {" · "}
                        {new Date(s.createdAt).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })}
                      </div>
                      {s.files.length > 0 && (
                        <ul className="mt-2 flex flex-wrap gap-1.5">
                          {s.files.map((f) => (
                            <li key={f.name} className="chip normal-case tracking-normal">{f.name}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <DecisionButtons id={s.id} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </StaffShell>
  );
}

function Row({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5">
      <span className="text-ink/55">{label}</span>
      <span className={warn ? "text-brass" : "text-ink/80"}>{value}</span>
    </div>
  );
}
