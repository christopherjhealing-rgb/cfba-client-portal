import Link from "next/link";
import { redirect } from "next/navigation";
import { isStaff } from "@/lib/session";
import * as repo from "@/lib/repo";
import { StaffShell } from "@/components/StaffShell";
import { InfoSheetManager } from "@/components/InfoSheetManager";
import { PUBLISHED_SHEETS } from "@/lib/info-sheets";
import { FormManager } from "@/components/FormManager";
import { PORTAL_FORMS } from "@/lib/resources";
import { EngineeringControl } from "@/components/EngineeringControl";
import { listEngSets } from "@/lib/engineering";

export const dynamic = "force-dynamic";

/** What clients can read and use: guidance notes, council forms, and the
 *  engineering checkers. All of it swappable without a deploy, which is why it
 *  lives here rather than in the code. */
export default async function ContentPage() {
  if (!(await isStaff())) redirect("/admin/login");

  const [sheetOverrides, uploadedForms, engSets, eng] = await Promise.all([
    repo.listFiles("info-sheets").catch(() => []),
    repo.listFiles("forms").catch(() => []),
    listEngSets().catch(() => []),
    repo.getSetting<{ enabled?: boolean; url?: string }>("engineering").catch(() => null),
  ]);

  return (
    <StaffShell title="Content" sub="Guidance notes, council forms and the engineering checkers." active="/admin/content">
      <Link href="/admin" className="text-[13px] text-seal underline">← Back to Admin</Link>

      <p className="mb-6 mt-4 max-w-2xl text-[14px] leading-relaxed text-ink/65">
        Everything here can be replaced without a deploy. Upload a new version and
        clients see it on their next visit — the old one stops being served the
        moment the new one lands.
      </p>

      <InfoSheetManager
        sheets={PUBLISHED_SHEETS.map((s) => ({ file: s.file, title: s.title }))}
        overridden={sheetOverrides.map((f) => f.name)}
      />

      <FormManager
        forms={PORTAL_FORMS.map((f) => ({ key: f.key, code: f.code, title: f.title }))}
        uploaded={uploadedForms.map((f) => f.name)}
      />

      <EngineeringControl
        initial={{ enabled: !!eng?.enabled, url: eng?.url || "" }}
        initialSets={engSets}
      />
    </StaffShell>
  );
}
