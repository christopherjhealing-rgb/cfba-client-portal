import { redirect } from "next/navigation";
import { studioIdentity } from "@/lib/studio";
import { StudioAuth } from "@/components/StudioAuth";

export const dynamic = "force-dynamic";

export default async function StudioFrontDoor() {
  if (await studioIdentity()) redirect("/studio/designs");

  return (
    <div className="mx-auto max-w-5xl">
      <div className="grid items-start gap-8 lg:grid-cols-[1.1fr_1fr]">
        <div className="pt-2">
          <h1 className="font-display text-[30px] font-semibold leading-tight text-ink">
            A compliant site plan,
            <br />drawn in minutes
          </h1>
          <p className="mt-3 max-w-md text-[15px] leading-relaxed text-ink/65">
            Your lot at a real scale — traced over the aerial photo or typed in —
            with every structure dimensioned to the boundaries, a north point, a
            scale bar and a title block. Prints as a true-scale A4 sheet a
            council will accept.
          </p>
          <ul className="mt-5 space-y-2 text-[14px] text-ink/70">
            <li>· Save your plans and come back to them on any device</li>
            <li>· Duplicate a plan for the next job instead of redrawing it</li>
            <li>· Free to use, no card, no lock-in</li>
          </ul>
          <p className="mt-5 text-[13px] text-ink/60">
            Create a free account to start — it takes a few seconds and your
            plans are saved to it.
          </p>
        </div>
        <StudioAuth />
      </div>
    </div>
  );
}
