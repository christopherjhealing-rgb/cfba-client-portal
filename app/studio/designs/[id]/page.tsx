import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { studioIdentity, getDesignMeta } from "@/lib/studio";
import { CADASTRE_READY } from "@/lib/cadastre-source";
import { StudioEditor } from "@/components/StudioEditor";

export const dynamic = "force-dynamic";

export default async function StudioDesignPage(
  { params }: { params: Promise<{ id: string }> },
) {
  const who = await studioIdentity();
  if (!who) redirect("/studio");
  const id = (await params).id;
  const meta = await getDesignMeta(who.owner, id);
  if (!meta) notFound();

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link href="/studio/designs" className="text-[13px] text-seal underline">
            ← All plans
          </Link>
          <h1 className="studio-title mt-0.5 truncate text-[22px] text-ink">
            {meta.name}
          </h1>
        </div>
        <span className="text-[12.5px] text-ink/45">Saves automatically as you draw</span>
      </div>
      <StudioEditor id={id} owner={who.owner} cadastre={CADASTRE_READY} />
    </div>
  );
}
