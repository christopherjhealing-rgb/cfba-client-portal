import { redirect } from "next/navigation";
import { studioIdentity, listDesigns } from "@/lib/studio";
import { StudioDesigns } from "@/components/StudioDesigns";

export const dynamic = "force-dynamic";

export default async function StudioDesignList() {
  const who = await studioIdentity();
  if (!who) redirect("/studio");
  const designs = await listDesigns(who.owner);

  return (
    <StudioDesigns
      designs={designs}
      name={who.name}
      viaPortal={who.viaPortal}
    />
  );
}
